//! ESPHome devices over their native API (TCP 6053, Noise-encrypted),
//! without any ESPHome library: the transport is written from the Noise
//! specification ([`noise`], [`frame`]), the messages by hand ([`api`]).
//!
//! First use: voice satellites such as the Home Assistant Voice Preview
//! Edition. The driver keeps one connection open (the device restarts after
//! 15 minutes without any client), answers its pings and pings it every 20
//! s, and publishes the device: its volume and mute (its media player), and
//! what its voice is doing.

mod api;
mod find;
mod frame;
mod noise;
mod satellite;
mod sound;

use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context as _, bail};
use moli_core::{Access, Device, DeviceId, Kind, PointSpec, Semantic, Unit, Value};
use moli_runtime::{BoxFuture, CommandRequest, Driver, DriverCtx};
use serde::Deserialize;
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::Instant;

/// The marker of a handshake the device refused for its key.
pub(crate) const WRONG_KEY: &str = "the device refused the API key";
/// The marker of a device speaking the API in clear: it has no key.
pub(crate) const IN_CLEAR: &str = "the device speaks the API in clear (it has no key)";
const API_KEY: &str = "api_key";
const PING_EVERY: Duration = Duration::from_secs(20);
/// Nothing at all from the device for this long (it pings after 60 s of
/// silence): the connection is dead.
const SILENCE_LIMIT: Duration = Duration::from_secs(90);
const RETRY_MIN: Duration = Duration::from_secs(5);
const RETRY_MAX: Duration = Duration::from_secs(60);
/// Just after Moli gave a device its key, the device may still answer in
/// clear for a moment: that is not a device that lost it.
const SWITCHING: Duration = Duration::from_secs(30);
/// No answer at the device's address: it may have a new one.
const NOT_THERE: &str = "the device does not answer at its address";
/// One look around the home network for a device gone silent, at most this often.
const SEARCH_EVERY: Duration = Duration::from_secs(10 * 60);
/// What the voice is doing, as the dashboard and automations read it.
const STATES: [&str; 4] = ["idle", "listening", "thinking", "speaking"];

fn default_port() -> u16 {
    6053
}

fn default_window() -> u64 {
    8
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    /// Moli as the device reaches it (`http://host:8790`): the sounds and
    /// the voice it plays.
    #[serde(default)]
    pub media_base: Option<String>,
    /// Seconds a conversation stays open after each answer.
    #[serde(default = "default_window")]
    pub window_s: u64,
    /// The wake words to keep active (their ids in the device's firmware,
    /// e.g. `hey_moli`); empty: as the device has them.
    #[serde(default)]
    pub wake_words: Vec<String>,
    /// The device's MAC address: a device without a key is given one only
    /// if it is this one (an address may have gone to another device).
    #[serde(default)]
    pub mac: Option<String>,
    /// The device's own log in Moli's, from this level up: `none`,
    /// `error`, `warn`, `info`, `debug`.
    #[serde(default = "default_logs")]
    pub logs: String,
}

fn default_logs() -> String {
    "warn".into()
}

/// The API's number for a log level (`None`: no log).
fn log_level(name: &str) -> Option<u64> {
    match name.trim().to_ascii_lowercase().as_str() {
        "error" => Some(1),
        "warn" | "warning" => Some(2),
        "info" => Some(3),
        "debug" => Some(5),
        _ => None,
    }
}

#[derive(Debug)]
pub struct Esphome {
    config: Config,
}

impl Esphome {
    #[must_use]
    pub fn new(config: Config) -> Self {
        Self { config }
    }
}

impl Driver for Esphome {
    fn kind(&self) -> &'static str {
        "esphome"
    }

    fn run<'a>(&'a self, ctx: &'a mut DriverCtx) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(run(&self.config, ctx))
    }
}

fn spec(key: &str, label: &str, kind: Kind, write: bool, unit: Option<Unit>) -> PointSpec {
    PointSpec {
        key: key.into(),
        label: label.into(),
        semantic: Semantic::infer(key, unit.as_ref()),
        kind,
        access: Access { read: true, write },
        unit,
    }
}

fn device(
    id: &DeviceId,
    ctx: &DriverCtx,
    info: &api::DeviceInfo,
    hello: &frame::ServerHello,
    entities: &Entities,
) -> Device {
    let name = [&info.friendly_name, &info.name, &hello.name]
        .into_iter()
        .find(|n| !n.is_empty())
        .cloned()
        .unwrap_or_default();
    let mut points = vec![
        spec(
            "state",
            &moli_i18n::tr!("pilotes.esphome.etat"),
            Kind::Enum {
                values: STATES.iter().map(|s| (*s).into()).collect(),
            },
            false,
            None,
        ),
        spec(
            "volume",
            &moli_i18n::tr!("pilotes.esphome.volume"),
            Kind::Numeric {
                min: Some(0.0),
                max: Some(100.0),
                step: Some(1.0),
            },
            true,
            Some(Unit::Percent),
        ),
        spec(
            "muted",
            &moli_i18n::tr!("pilotes.esphome.sourdine"),
            Kind::Binary,
            true,
            None,
        ),
        spec(
            "wake_word",
            &moli_i18n::tr!("pilotes.esphome.mot_activation"),
            Kind::Text,
            false,
            None,
        ),
        spec(
            "say",
            &moli_i18n::tr!("pilotes.esphome.dire"),
            Kind::Text,
            true,
            None,
        ),
    ];
    // Every entity the device listed, as its own point. The voice points
    // above keep their keys: a device that also has a `state` entity keeps
    // both (the driver's is what automations read).
    for entity in &entities.published {
        if points.iter().any(|p| p.key == entity.spec.key) {
            continue;
        }
        points.push(entity.spec.clone());
    }
    Device {
        id: id.clone(),
        instance: ctx.instance().clone(),
        native_name: name.into(),
        manufacturer: Some(info.manufacturer.clone())
            .filter(|m| !m.is_empty())
            .map(Into::into),
        model: Some(
            if info.model.is_empty() {
                moli_i18n::tr!("pilotes.esphome.satellite")
            } else {
                info.model.clone()
            }
            .into(),
        ),
        description: None,
        native_room: None,
        members: Vec::new(),
        points,
    }
}

/// Waits for a person: says why, then idles until Moli stops.
async fn wait_for_person(ctx: &DriverCtx, why: String) {
    ctx.wait_for(why);
    ctx.cancelled().await;
}

async fn run(config: &Config, ctx: &mut DriverCtx) -> anyhow::Result<()> {
    // Its address may change (a new lease): the driver follows the device.
    let mut config = config.clone();
    let config = &mut config;
    let mut searched: Option<Instant> = None;
    // No key yet is fine: a device in clear is given one (see `provision`).
    let mut psk = match ctx.secret(API_KEY).map(|k| noise::psk_from_base64(&k)) {
        None => None,
        Some(Ok(psk)) => Some(psk),
        Some(Err(_)) => {
            wait_for_person(ctx, moli_i18n::tr!("pilotes.esphome.cle_invalide")).await;
            return Ok(());
        }
    };
    ctx.ready();
    let mut pause = RETRY_MIN;
    let mut last_error: Option<String> = None;
    let mut known: Option<DeviceId> = None;
    let mut provisioned: Option<Instant> = None;
    loop {
        let started = Instant::now();
        let outcome = match &psk {
            Some(psk) => session(config, ctx, psk, &mut known).await,
            None => Err(anyhow::anyhow!(IN_CLEAR)),
        };
        let error = match outcome {
            Ok(()) => return Ok(()), // shutting down
            Err(e) => format!("{e:#}"),
        };
        if let Some(id) = &known {
            ctx.set_availability(id, false);
        }
        if error.contains(WRONG_KEY) {
            let why = moli_i18n::tr!(
                "pilotes.esphome.cle_refusee",
                instance = ctx.instance(),
                key = API_KEY
            );
            wait_for_person(ctx, why).await;
            return Ok(());
        }
        // Moli holds its key: what speaks in clear at that address (the
        // device, reset, or another one) never gets a new one without a
        // person. It would replace the key the device holds, and go to
        // whoever answered (the MAC it gives is only its own word). Right
        // after Moli gave it, the device is only switching: try again.
        let switching = provisioned.is_some_and(|at| at.elapsed() < SWITCHING);
        if error.contains(IN_CLEAR) && psk.is_some() && !switching {
            let why = moli_i18n::tr!(
                "pilotes.esphome.en_clair",
                host = config.host,
                instance = ctx.instance(),
                key = API_KEY
            );
            wait_for_person(ctx, why).await;
            return Ok(());
        }
        let error = if error.contains(IN_CLEAR) && psk.is_none() {
            match provision(config, ctx).await {
                Ok(new) => {
                    psk = Some(new);
                    provisioned = Some(Instant::now());
                    pause = RETRY_MIN;
                    // The device switches to encryption: a moment, then again.
                    tokio::time::sleep(Duration::from_secs(1)).await;
                    continue;
                }
                Err(Provision::Person(why)) => {
                    wait_for_person(ctx, why).await;
                    return Ok(());
                }
                Err(Provision::Retry(e)) => format!("{e:#}"),
            }
        } else {
            error
        };
        if error.contains(NOT_THERE) && searched.is_none_or(|at| at.elapsed() >= SEARCH_EVERY) {
            searched = Some(Instant::now());
            if let Some(ip) = search(config, ctx).await {
                config.host = ip.to_string();
                pause = RETRY_MIN;
                continue;
            }
        }
        // Each new reason once; a device switched off says the same every time.
        if last_error.as_deref() == Some(error.as_str()) {
            tracing::debug!(instance = %ctx.instance(), error, "esphome device unreachable");
        } else {
            tracing::warn!(instance = %ctx.instance(), error, "esphome device unreachable");
            last_error = Some(error);
        }
        // A connection that lasted starts again quickly.
        pause = if started.elapsed() > RETRY_MAX {
            RETRY_MIN
        } else {
            (pause * 2).min(RETRY_MAX)
        };
        tokio::select! {
            () = tokio::time::sleep(pause) => {}
            () = ctx.cancelled() => return Ok(()),
        }
    }
}

/// The device's new address on the home network, found by its MAC (only
/// with `mac` set and an IPv4 `host`).
async fn search(config: &Config, ctx: &DriverCtx) -> Option<std::net::Ipv4Addr> {
    let mac = config.mac.as_deref()?;
    let old: std::net::Ipv4Addr = config.host.parse().ok()?;
    let found = find::find(&find::neighbours(old), config.port, mac).await;
    match found {
        Some(ip) => tracing::warn!(
            instance = %ctx.instance(),
            old = %old,
            new = %ip,
            "esphome device found at a new address (update `host` in the configuration)"
        ),
        None => {
            tracing::info!(instance = %ctx.instance(), "esphome device not found on the home network");
        }
    }
    found
}

/// Why a key could not be given: a person must act, or it may work later.
enum Provision {
    Person(String),
    Retry(anyhow::Error),
}

impl From<anyhow::Error> for Provision {
    fn from(e: anyhow::Error) -> Self {
        Self::Retry(e)
    }
}

impl From<std::io::Error> for Provision {
    fn from(e: std::io::Error) -> Self {
        Self::Retry(e.into())
    }
}

/// `AC:BC:…` or `acbc…` → `acbc…`.
fn mac_hex(mac: &str) -> String {
    mac.chars()
        .filter(char::is_ascii_hexdigit)
        .collect::<String>()
        .to_lowercase()
}

/// The next message in clear of type `kind`, the device's pings answered.
async fn expect_plain(tcp: &mut TcpStream, kind: u16) -> anyhow::Result<Vec<u8>> {
    loop {
        let (got, payload) = tokio::time::timeout(frame::HANDSHAKE_LIMIT, frame::read_plain(tcp))
            .await
            .context("the device stopped answering")??;
        match got {
            k if k == kind => return Ok(payload),
            api::PING_REQUEST => frame::send_plain(tcp, api::PING_RESPONSE, &[]).await?,
            api::DISCONNECT_REQUEST => bail!("the device closed the connection"),
            _ => {}
        }
    }
}

/// The device speaks in clear: it has no key (Home Assistant clears it when
/// it lets a device go; a new one never had one). Moli gives it its own, after
/// checking it is the expected device, and files it in the vault first: never
/// a key the device holds and Moli lost. Only while Moli holds none: one it
/// holds is never replaced this way (see `run`).
async fn provision(config: &Config, ctx: &DriverCtx) -> Result<[u8; 32], Provision> {
    let mut tcp = connect(config).await?;
    let info = match plain_info(&mut tcp).await {
        Ok(info) => info,
        // It holds a key after all, one Moli does not know.
        Err(e) if format!("{e:#}").contains("asks for encryption") => {
            return Err(Provision::Person(moli_i18n::tr!(
                "pilotes.esphome.cle_manquante",
                instance = ctx.instance(),
                key = API_KEY
            )));
        }
        Err(e) => return Err(e.into()),
    };
    if !info.encryption_supported {
        return Err(Provision::Person(moli_i18n::tr!(
            "pilotes.esphome.sans_chiffrement"
        )));
    }
    let mac = mac_hex(&info.mac);
    if let Some(expected) = config.mac.as_deref().map(mac_hex).filter(|e| *e != mac) {
        return Err(Provision::Person(moli_i18n::tr!(
            "pilotes.esphome.autre_appareil",
            host = config.host,
            mac = mac,
            expected = expected
        )));
    }
    let key = noise::new_key_base64()?;
    ctx.store_secret(API_KEY, &key).await?;
    frame::send_plain(&mut tcp, api::NOISE_SET_KEY_REQUEST, &api::set_key(&key)).await?;
    let saved = expect_plain(&mut tcp, api::NOISE_SET_KEY_RESPONSE).await?;
    if !moli_net::proto::parse(&saved).is_some_and(|m| m.bool(1)) {
        return Err(Provision::Retry(anyhow::anyhow!(
            "the device did not save the key"
        )));
    }
    tracing::warn!(
        instance = %ctx.instance(),
        device = %info.friendly_name,
        mac,
        "the device had no API key: Moli gave it its own"
    );
    Ok(noise::psk_from_base64(&key)?)
}

/// A device in clear: our hello, then what it says of itself.
async fn plain_info(tcp: &mut TcpStream) -> anyhow::Result<api::DeviceInfo> {
    frame::send_plain(tcp, api::HELLO_REQUEST, &api::hello()).await?;
    expect_plain(tcp, api::HELLO_RESPONSE).await?;
    frame::send_plain(tcp, api::DEVICE_INFO_REQUEST, &[]).await?;
    api::device_info(&expect_plain(tcp, api::DEVICE_INFO_RESPONSE).await?)
        .context("unreadable device info")
}

async fn connect(config: &Config) -> anyhow::Result<TcpStream> {
    let tcp = tokio::time::timeout(
        frame::HANDSHAKE_LIMIT,
        TcpStream::connect((config.host.as_str(), config.port)),
    )
    .await
    .context("no answer")
    .context(NOT_THERE)?
    .with_context(|| format!("cannot reach {}:{}", config.host, config.port))
    .context(NOT_THERE)?;
    tcp.set_nodelay(true)?;
    Ok(tcp)
}

/// Messages from the device, or why they stopped.
type Inbox = mpsc::Receiver<anyhow::Result<(u16, Vec<u8>)>>;
type Outbox = frame::Sender<tokio::net::tcp::OwnedWriteHalf>;

/// Aborts the reading task when the session ends, however it ends.
struct Reader(tokio::task::JoinHandle<()>);

impl Drop for Reader {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// What the session learnt of the device's entities.
#[derive(Debug, Default)]
struct Entities {
    media_player: Option<u32>,
    button: Option<u32>,
    /// Every entity Moli publishes, for the state and command routing.
    published: Vec<Published>,
}

/// One listed entity, as a point of the device.
#[derive(Clone, Debug)]
struct Published {
    /// The entity's API key, as used in every state and command message.
    key: u32,
    kind: api::EntityKind,
    /// The point as published (its key is the entity's `object_id`).
    spec: PointSpec,
    /// The allowed values of a select.
    options: Vec<Arc<str>>,
}

impl Entities {
    fn by_key(&self, key: u32) -> Option<&Published> {
        self.published.iter().find(|p| p.key == key)
    }
}

/// A point key from the entity's `object_id`: lowercase ascii, `_` for
/// anything else; a numbered fallback when the device gives none, and a
/// numeric suffix on a collision.
fn point_key(object_id: &str, key: u32, name: &str, taken: &mut std::collections::HashSet<String>) -> Arc<str> {
    let mut base: String = object_id
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    base = base.trim_matches('_').to_owned();
    if base.is_empty() {
        let from_name: String = name
            .trim()
            .to_ascii_lowercase()
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
            .collect();
        base = from_name.trim_matches('_').to_owned();
    }
    if base.is_empty() || base.chars().next().is_some_and(|c| c.is_ascii_digit()) {
        base = format!("e_{base}_{key:x}");
    }
    let mut candidate = base.clone();
    let mut n = 2;
    while !taken.insert(candidate.clone()) {
        candidate = format!("{base}_{n}");
        n += 1;
    }
    candidate.into()
}

/// A `PointSpec` for a listed entity, and what the driver needs to route it.
fn published_point(info: &api::EntityInfo, kind: api::EntityKind, point: Arc<str>) -> Published {
    let unit = info.unit.as_deref().and_then(moli_core::Unit::parse);
    let label: Arc<str> = if info.name.is_empty() {
        info.object_id.clone().into()
    } else {
        info.name.clone().into()
    };
    let (spec_kind, options, write): (Kind, Vec<Arc<str>>, bool) = match kind {
        api::EntityKind::BinarySensor => (Kind::Binary, Vec::new(), false),
        api::EntityKind::Switch | api::EntityKind::Light => (Kind::Binary, Vec::new(), true),
        api::EntityKind::Sensor => (
            Kind::Numeric {
                min: None,
                max: None,
                step: None,
            },
            Vec::new(),
            false,
        ),
        api::EntityKind::Number => (
            Kind::Numeric {
                min: info.min.map(f64::from),
                max: info.max.map(f64::from),
                step: info.step.map(f64::from),
            },
            Vec::new(),
            true,
        ),
        api::EntityKind::TextSensor => (Kind::Text, Vec::new(), false),
        api::EntityKind::Select => {
            let values: Vec<Arc<str>> =
                info.options.iter().map(|o| Arc::from(o.as_str())).collect();
            (
                Kind::Enum {
                    values: values.clone(),
                },
                values,
                true,
            )
        }
        api::EntityKind::Button => (Kind::Binary, Vec::new(), true),
        api::EntityKind::Camera => (Kind::Binary, Vec::new(), false),
    };
    let semantic = if kind == api::EntityKind::Button {
        Semantic::Control
    } else {
        Semantic::infer(&point, unit.as_ref())
    };
    Published {
        key: info.key,
        kind,
        spec: PointSpec {
            key: point,
            label,
            kind: spec_kind,
            access: Access { read: true, write },
            unit,
            semantic,
        },
        options,
    }
}

/// A connection open and introduced: hello said, the device and its entities known.
struct Opened {
    tx: Outbox,
    inbox: Inbox,
    _reader: Reader,
    hello: frame::ServerHello,
    info: api::DeviceInfo,
    entities: Entities,
}

/// A camera of an ESPHome device, answered from its live connection. One
/// per camera: the driver sets the slot's key while the device is connected,
/// and clears it otherwise (a snapshot then fails fast).
#[derive(Clone, Debug)]
struct Snapshots {
    key: u32,
    /// The pending reply, while a viewer waits.
    pending: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<Vec<u8>>>>>,
    /// Image bytes received so far (a camera answers in several messages).
    buf: Arc<std::sync::Mutex<Vec<u8>>>,
    /// Rung when a viewer is waiting: the session sends the request.
    asked: Arc<tokio::sync::Notify>,
}

impl Snapshots {
    fn new(key: u32) -> Self {
        Self {
            key,
            pending: Arc::new(std::sync::Mutex::new(None)),
            buf: Arc::new(std::sync::Mutex::new(Vec::new())),
            asked: Arc::new(tokio::sync::Notify::new()),
        }
    }

    /// Takes the pending reply, if a viewer waits (consumes it).
    fn take(&self) -> Option<tokio::sync::oneshot::Sender<Vec<u8>>> {
        self.pending
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
    }

    fn clear(&self) {
        let _ = self.take();
        self.buf
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }

    /// One image message from the device: pooled, then handed to the viewer
    /// once the device says it is complete.
    fn deliver(&self, key: u32, data: &[u8], done: bool) {
        if key != self.key {
            return;
        }
        let mut buf = self.buf.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        buf.extend_from_slice(data);
        if done {
            let bytes = std::mem::take(&mut *buf);
            drop(buf);
            if let Some(reply) = self.take() {
                let _ = reply.send(bytes);
            }
        }
    }
}

impl moli_runtime::media::SnapshotSource for Snapshots {
    fn snapshot(&self) -> BoxFuture<'_, anyhow::Result<moli_runtime::media::Image>> {
        Box::pin(async move {
            let (reply, rx) = tokio::sync::oneshot::channel();
            *self
                .pending
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(reply);
            self.asked.notify_one();
            let bytes = tokio::time::timeout(Duration::from_secs(15), rx)
                .await
                .map_err(|_| anyhow::anyhow!("no image in time"))?
                .map_err(|_| anyhow::anyhow!("the device is not connected"))?;
            if bytes.is_empty() {
                anyhow::bail!("the camera sent no image");
            }
            Ok(moli_runtime::media::Image {
                content_type: "image/jpeg".into(),
                bytes,
            })
        })
    }
}

/// Connects, does the handshake, says hello, reads the device and its entities.
async fn open(config: &Config, psk: &[u8; 32]) -> anyhow::Result<Opened> {
    let mut tcp = connect(config).await?;
    let (hello, send, receive) =
        tokio::time::timeout(frame::HANDSHAKE_LIMIT, frame::handshake(&mut tcp, psk))
            .await
            .context("handshake: no answer")??;
    let (read, write) = tcp.into_split();
    let mut tx = frame::Sender::new(write, send);
    let (inbox_tx, mut inbox) = mpsc::channel(64);
    let reader = Reader(tokio::spawn(async move {
        let mut rx = frame::Receiver::new(read, receive);
        loop {
            let next = rx.next().await;
            let failed = next.is_err();
            if inbox_tx.send(next).await.is_err() || failed {
                return;
            }
        }
    }));

    tx.send(api::HELLO_REQUEST, &api::hello()).await?;
    expect(&mut inbox, &mut tx, api::HELLO_RESPONSE).await?;
    tx.send(api::DEVICE_INFO_REQUEST, &[]).await?;
    let info = api::device_info(&expect(&mut inbox, &mut tx, api::DEVICE_INFO_RESPONSE).await?)
        .context("unreadable device info")?;
    tx.send(api::LIST_ENTITIES_REQUEST, &[]).await?;
    let mut entities = Entities::default();
    let mut taken = std::collections::HashSet::new();
    loop {
        let (kind, payload) = next(&mut inbox, &mut tx).await?;
        match kind {
            api::LIST_ENTITIES_DONE => break,
            api::LIST_MEDIA_PLAYER => entities.media_player = api::entity(&payload).map(|e| e.key),
            api::LIST_EVENT => entities.button = api::entity(&payload).map(|e| e.key),
            api::LIST_BINARY_SENSOR => list_entity(&mut entities, &mut taken, api::EntityKind::BinarySensor, &payload),
            api::LIST_SENSOR => list_entity(&mut entities, &mut taken, api::EntityKind::Sensor, &payload),
            api::LIST_SWITCH => list_entity(&mut entities, &mut taken, api::EntityKind::Switch, &payload),
            api::LIST_TEXT_SENSOR => list_entity(&mut entities, &mut taken, api::EntityKind::TextSensor, &payload),
            api::LIST_LIGHT => list_entity(&mut entities, &mut taken, api::EntityKind::Light, &payload),
            api::LIST_NUMBER => list_entity(&mut entities, &mut taken, api::EntityKind::Number, &payload),
            api::LIST_SELECT => list_entity(&mut entities, &mut taken, api::EntityKind::Select, &payload),
            api::LIST_BUTTON => list_entity(&mut entities, &mut taken, api::EntityKind::Button, &payload),
            api::LIST_CAMERA => list_entity(&mut entities, &mut taken, api::EntityKind::Camera, &payload),
            _ => {}
        }
    }
    Ok(Opened {
        tx,
        inbox,
        _reader: reader,
        hello,
        info,
        entities,
    })
}

/// Adds one listed entity to the catalog, unless its point collapses with
/// one already there (a device repeating a name is not worth a broken point).
fn list_entity(
    entities: &mut Entities,
    taken: &mut std::collections::HashSet<String>,
    kind: api::EntityKind,
    payload: &[u8],
) {
    let Some(info) = api::entity_info(kind, payload) else {
        return;
    };
    let point = point_key(&info.object_id, info.key, &info.name, taken);
    entities.published.push(published_point(&info, kind, point));
}

/// One connection, from the handshake until it fails (`Err`) or Moli stops (`Ok`).
async fn session(
    config: &Config,
    ctx: &mut DriverCtx,
    psk: &[u8; 32],
    known: &mut Option<DeviceId>,
) -> anyhow::Result<()> {
    let Opened {
        mut tx,
        mut inbox,
        _reader,
        hello,
        info,
        entities,
    } = open(config, psk).await?;
    let id = ctx.device_id(&hello.mac);
    ctx.upsert_device(device(&id, ctx, &info, &hello, &entities));
    ctx.set_state(&id, "state", Value::Text("idle".into()));
    ctx.set_availability(&id, true);
    *known = Some(id.clone());
    // A camera of the device: its images are answered from this connection.
    let camera = camera_slot(&id, ctx, &entities);
    tracing::info!(
        instance = %ctx.instance(),
        device = %info.friendly_name,
        esphome = %info.esphome_version,
        voice_flags = info.voice_flags,
        entities = entities.published.len(),
        "esphome device connected"
    );
    tx.send(api::SUBSCRIBE_STATES, &[]).await?;
    if let Some(level) = log_level(&config.logs) {
        tx.send(api::SUBSCRIBE_LOGS, &api::subscribe_logs(level))
            .await?;
    }
    // Moli is the device's voice assistant (the first to subscribe keeps it).
    tx.send(api::SUBSCRIBE_VOICE_ASSISTANT, &api::subscribe_voice())
        .await?;
    // What the firmware offers first: the configured words are set only once
    // the device says it has them (see `wake_words`).
    tx.send(api::VOICE_CONFIGURATION_REQUEST, &[]).await?;
    let mut words_set = false;
    let (mut voice, mut thoughts) = satellite::Voice::new(
        Duration::from_secs(config.window_s),
        config.media_base.clone(),
    );

    let mut ping = tokio::time::interval(PING_EVERY);
    ping.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let mut heard = Instant::now();
    loop {
        let deadline = voice.deadline();
        tokio::select! {
            message = inbox.recv() => {
                let (kind, payload) = message.context("the connection closed")??;
                heard = Instant::now();
                if kind == api::VOICE_CONFIGURATION_RESPONSE {
                    words_set |= wake_words(ctx, &mut tx, &config.wake_words, words_set, &payload).await?;
                } else {
                    on_message(ctx, &id, &mut tx, &entities, &mut voice, &camera, kind, &payload).await?;
                }
            }
            Some((generation, thought)) = thoughts.recv() => {
                voice.on_thought(ctx, &id, &mut tx, generation, thought).await?;
            }
            () = until(deadline) => voice.on_deadline(ctx, &id, &mut tx).await?,
            _ = ping.tick() => {
                if heard.elapsed() > SILENCE_LIMIT {
                    bail!("the device went silent");
                }
                tx.send(api::PING_REQUEST, &[]).await?;
            }
            command = ctx.next_command() => {
                let Some(command) = command else {
                    if let Some(source) = &camera {
                        source.clear();
                    }
                    let _ = tx.send(api::DISCONNECT_REQUEST, &[]).await;
                    return Ok(());
                };
                let result = order(ctx, &mut tx, &entities, config.media_base.as_deref(), &command).await;
                command.reply(result);
            }
            () = camera_asked(&camera) => camera_request(&mut tx, &camera).await?,
        }
    }
}

/// The device's camera, when it has one: a source registered with the hub so
/// its images are answered from this live connection.
fn camera_slot(id: &DeviceId, ctx: &DriverCtx, entities: &Entities) -> Option<Arc<Snapshots>> {
    let published = entities
        .published
        .iter()
        .find(|p| p.kind == api::EntityKind::Camera)?;
    let source = Arc::new(Snapshots::new(published.key));
    ctx.provide_snapshots(id, Arc::clone(&source) as Arc<dyn moli_runtime::media::SnapshotSource>);
    Some(source)
}

/// Waits until a viewer asks for an image (never, without a camera).
async fn camera_asked(camera: &Option<Arc<Snapshots>>) {
    match camera {
        Some(source) => source.asked.notified().await,
        None => std::future::pending().await,
    }
}

/// Sends the device a one-shot image request.
async fn camera_request(tx: &mut Outbox, camera: &Option<Arc<Snapshots>>) -> anyhow::Result<()> {
    if camera.is_some() {
        tx.send(api::CAMERA_IMAGE_REQUEST, &api::camera_image_request(true))
            .await?;
    }
    Ok(())
}

/// The wake words to set: those of `wanted` the firmware has, unless they
/// are already the active ones. None of them in the firmware: nothing set, the
/// device keeps its own (a word it lacks would leave it deaf to all).
fn words_to_set<'a>(
    wanted: &'a [String],
    available: &[&str],
    active: &[String],
) -> Option<Vec<&'a str>> {
    let chosen: Vec<&str> = wanted
        .iter()
        .map(String::as_str)
        .filter(|w| available.contains(w))
        .collect();
    let same = chosen.len() == active.len() && chosen.iter().all(|c| active.iter().any(|a| a == c));
    (!chosen.is_empty() && !same).then_some(chosen)
}

/// The device's wake words: logged, and set to the configured ones it has
/// (once per connection). Returns whether they were set.
async fn wake_words(
    ctx: &DriverCtx,
    tx: &mut Outbox,
    wanted: &[String],
    already: bool,
    payload: &[u8],
) -> anyhow::Result<bool> {
    let Some(words) = api::wake_words(payload) else {
        return Ok(false);
    };
    let available: Vec<&str> = words.available.iter().map(|(id, _)| id.as_str()).collect();
    tracing::info!(
        instance = %ctx.instance(),
        ?available,
        active = ?words.active,
        max_active = words.max_active,
        "wake words"
    );
    if already || wanted.is_empty() {
        return Ok(false);
    }
    let Some(chosen) = words_to_set(wanted, &available, &words.active) else {
        if !wanted.iter().any(|w| available.contains(&w.as_str())) {
            tracing::warn!(
                instance = %ctx.instance(),
                ?wanted,
                "none of the configured wake words is in the device's firmware: it keeps its own"
            );
        }
        return Ok(false);
    };
    tx.send(api::VOICE_SET_CONFIGURATION, &api::set_wake_words(&chosen))
        .await?;
    // Read back what the device made of it (logged above, next time).
    tx.send(api::VOICE_CONFIGURATION_REQUEST, &[]).await?;
    Ok(true)
}

/// One message from the device, once connected.
async fn on_message(
    ctx: &DriverCtx,
    id: &DeviceId,
    tx: &mut Outbox,
    entities: &Entities,
    voice: &mut satellite::Voice,
    camera: &Option<Arc<Snapshots>>,
    kind: u16,
    payload: &[u8],
) -> anyhow::Result<()> {
    match kind {
        api::PING_REQUEST => tx.send(api::PING_RESPONSE, &[]).await?,
        api::DISCONNECT_REQUEST => {
            let _ = tx.send(api::DISCONNECT_RESPONSE, &[]).await;
            bail!("the device closed the connection");
        }
        api::VOICE_AUDIO => {
            if let Some(pcm) = api::voice_audio(payload) {
                voice.on_audio(ctx, id, tx, &pcm).await?;
            }
        }
        api::VOICE_REQUEST => {
            if let Some(request) = api::voice_request(payload) {
                voice.on_request(ctx, id, tx, &request).await?;
            }
        }
        api::VOICE_ANNOUNCE_FINISHED => voice.on_played(ctx, id),
        api::MEDIA_PLAYER_STATE => {
            if let Some(state) =
                api::media_state(payload).filter(|s| Some(s.key) == entities.media_player)
            {
                ctx.set_state(
                    id,
                    "volume",
                    Value::Float(f64::from((state.volume * 100.0).round())),
                );
                ctx.set_state(id, "muted", Value::Bool(state.muted));
            }
        }
        api::LOG => {
            if let Some((level, line)) = api::log_line(payload) {
                tracing::info!(instance = %ctx.instance(), level, "device: {line}");
            }
        }
        api::EVENT => {
            if let Some((_, event)) =
                api::event(payload).filter(|(key, _)| Some(*key) == entities.button)
            {
                voice.on_button(ctx, id, tx, &event).await?;
            }
        }
        api::BINARY_SENSOR_STATE => {
            if let Some(state) = api::binary_state(payload) {
                record_state(ctx, id, entities, &state);
            }
        }
        api::SWITCH_STATE => {
            if let Some(state) = api::switch_state(payload) {
                record_state(ctx, id, entities, &state);
            }
        }
        api::SENSOR_STATE | api::NUMBER_STATE => {
            if let Some(state) = api::sensor_state(payload) {
                record_state(ctx, id, entities, &state);
            }
        }
        api::TEXT_SENSOR_STATE | api::SELECT_STATE => {
            if let Some(state) = api::text_state(payload) {
                record_state(ctx, id, entities, &state);
            }
        }
        api::LIGHT_STATE => {
            if let Some((state, _brightness)) = api::light_state(payload) {
                record_state(ctx, id, entities, &state);
            }
        }
        api::CAMERA_IMAGE => {
            if let (Some(source), Some((key, data, done))) = (camera, api::camera_image(payload)) {
                source.deliver(key, &data, done);
            }
        }
        _ => {}
    }
    Ok(())
}
fn record_state(ctx: &DriverCtx, id: &DeviceId, entities: &Entities, state: &api::EntityState) {
    let Some(entity) = entities.by_key(state.key) else {
        return;
    };
    if state.missing {
        return;
    }
    let value = match &state.value {
        api::StateValue::Bool(b) => Value::Bool(*b),
        api::StateValue::Float(f) => Value::Float(f64::from(*f)),
        api::StateValue::Text(t) => Value::Text(t.as_str().into()),
    };
    ctx.set_state(id, &entity.spec.key, value);
}

/// Until `at`; forever without one (a `select!` branch that never fires).
async fn until(at: Option<Instant>) {
    match at {
        Some(at) => tokio::time::sleep_until(at).await,
        None => std::future::pending().await,
    }
}

/// What a satellite may say at once.
const MAX_SAY: usize = 500;

/// A command for the device: one of its published entities (a switch, a
/// number, a select, a light, a button), or the volume/mute/say of its
/// media player.
async fn order(
    ctx: &DriverCtx,
    tx: &mut Outbox,
    entities: &Entities,
    media_base: Option<&str>,
    command: &CommandRequest,
) -> Result<(), String> {
    // An entity Moli listed: it carries its own key and shape.
    if let Some(entity) = entities
        .published
        .iter()
        .find(|p| &*p.spec.key == &*command.key)
    {
        let payload = entity_command(entity, &command.value)?;
        return tx
            .send(payload.0, &payload.1)
            .await
            .map_err(|e| format!("{e:#}"));
    }
    let key = entities
        .media_player
        .ok_or_else(|| moli_i18n::tr!("pilotes.esphome.sans_lecteur"))?;
    let payload = match (&*command.key, &command.value) {
        ("volume", Value::Float(v)) => {
            #[allow(clippy::cast_possible_truncation)]
            let v = (*v / 100.0) as f32;
            api::set_volume(key, v)
        }
        ("volume", Value::Int(v)) => {
            #[allow(clippy::cast_precision_loss)]
            let v = *v as f32 / 100.0;
            api::set_volume(key, v)
        }
        ("muted", Value::Bool(m)) => api::set_muted(key, *m),
        ("say", Value::Text(text)) => {
            let text = text.trim();
            if text.is_empty() || text.chars().count() > MAX_SAY {
                return Err(moli_i18n::tr!("pilotes.esphome.phrase"));
            }
            let url = ctx
                .voice_brain()
                .zip(media_base)
                .and_then(|(brain, base)| brain.announcement_url(base, text))
                .ok_or_else(|| moli_i18n::tr!("pilotes.esphome.sans_voix"))?;
            api::announce(key, &url)
        }
        (point, _) => {
            return Err(moli_i18n::tr!(
                "pilotes.esphome.lecture_seule",
                point = point
            ));
        }
    };
    tx.send(api::MEDIA_PLAYER_COMMAND, &payload)
        .await
        .map_err(|e| format!("{e:#}"))
}

/// The message that sets one entity: the kind's command, and the value.
fn entity_command(
    entity: &Published,
    value: &Value,
) -> Result<(u16, Vec<u8>), String> {
    let key = entity.key;
    let message = match (entity.kind, value) {
        (api::EntityKind::Switch, Value::Bool(on)) => {
            (api::SWITCH_COMMAND, api::switch_command(key, *on))
        }
        (api::EntityKind::Light, Value::Bool(on)) => {
            (api::LIGHT_COMMAND, api::light_command(key, *on))
        }
        (api::EntityKind::Number, v) => {
            let n = v
                .as_f64()
                .ok_or_else(|| moli_i18n::tr!("pilotes.esphome.lecture_seule", point = &entity.spec.key))?;
            #[allow(clippy::cast_possible_truncation)]
            (api::NUMBER_COMMAND, api::number_command(key, n as f32))
        }
        (api::EntityKind::Select, Value::Text(option)) => {
            if !entity.options.iter().any(|o| &**o == &**option) {
                return Err(moli_i18n::tr!("pilotes.esphome.lecture_seule", point = &entity.spec.key));
            }
            (api::SELECT_COMMAND, api::select_command(key, option))
        }
        (api::EntityKind::Button, _) => (api::BUTTON_COMMAND, api::button_command(key)),
        (_, _) => {
            return Err(moli_i18n::tr!(
                "pilotes.esphome.lecture_seule",
                point = &entity.spec.key
            ));
        }
    };
    Ok(message)
}

/// The next message, the device's pings answered on the way.
async fn next(inbox: &mut Inbox, tx: &mut Outbox) -> anyhow::Result<(u16, Vec<u8>)> {
    loop {
        let (kind, payload) = tokio::time::timeout(frame::HANDSHAKE_LIMIT, inbox.recv())
            .await
            .context("the device stopped answering")?
            .context("the connection closed")??;
        match kind {
            api::PING_REQUEST => tx.send(api::PING_RESPONSE, &[]).await?,
            api::DISCONNECT_REQUEST => {
                let _ = tx.send(api::DISCONNECT_RESPONSE, &[]).await;
                bail!("the device closed the connection");
            }
            _ => return Ok((kind, payload)),
        }
    }
}

/// The next message of type `kind` (others in between are skipped).
async fn expect(inbox: &mut Inbox, tx: &mut Outbox, kind: u16) -> anyhow::Result<Vec<u8>> {
    loop {
        let (got, payload) = next(inbox, tx).await?;
        if got == kind {
            return Ok(payload);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    use moli_core::{DriverStatus, InstanceId};
    use moli_net::proto::Writer;
    use moli_runtime::{Hub, HubOptions, MasterKey, spawn_driver};
    use tokio::io::{AsyncReadExt as _, AsyncWriteExt as _};
    use tokio::net::TcpListener;
    use tokio_util::sync::CancellationToken;

    use super::*;

    fn owned(words: &[&str]) -> Vec<String> {
        words.iter().map(|w| (*w).to_owned()).collect()
    }

    /// What answers at the device's address: in clear, with the expected
    /// MAC, and ready to take any key (a reset device, or another one).
    /// The flag rises when a key reaches it.
    async fn in_clear(mac: &'static str) -> (u16, Arc<AtomicBool>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let given = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&given);
        tokio::spawn(async move {
            while let Ok((mut tcp, _)) = listener.accept().await {
                let flag = Arc::clone(&flag);
                tokio::spawn(async move {
                    let mut first = [0u8; 1];
                    if tcp.peek(&mut first).await.is_err() {
                        return;
                    }
                    if first[0] != 0x00 {
                        // Moli's encrypted hello, answered in clear; then
                        // whatever comes, until Moli hangs up.
                        let _ = tcp.write_all(&[0x00, 0x00, 0x00]).await;
                        let _ = tcp.read_to_end(&mut Vec::new()).await;
                        return;
                    }
                    while let Ok((kind, _)) = frame::read_plain(&mut tcp).await {
                        let (answer, payload) = match kind {
                            api::HELLO_REQUEST => (api::HELLO_RESPONSE, Vec::new()),
                            api::DEVICE_INFO_REQUEST => (
                                api::DEVICE_INFO_RESPONSE,
                                Writer::new().str(3, mac).bool(19, true).finish(),
                            ),
                            api::NOISE_SET_KEY_REQUEST => {
                                flag.store(true, Ordering::SeqCst);
                                (
                                    api::NOISE_SET_KEY_RESPONSE,
                                    Writer::new().bool(1, true).finish(),
                                )
                            }
                            _ => continue,
                        };
                        if frame::send_plain(&mut tcp, answer, &payload).await.is_err() {
                            return;
                        }
                    }
                });
            }
        });
        (port, given)
    }

    #[tokio::test]
    async fn a_device_in_clear_never_replaces_the_key_moli_holds() {
        // The expected MAC: checking it is not enough to give a key.
        let (port, given) = in_clear("aa:bb:cc:dd:ee:ff").await;
        let vault = std::env::temp_dir().join(format!(
            "moli-esphome-secrets-{}-{port}.enc",
            std::process::id()
        ));
        let hub = Hub::new(HubOptions {
            secrets: Some((vault.clone(), MasterKey::generate().unwrap())),
            ..HubOptions::default()
        })
        .unwrap();
        let instance = InstanceId::from("voix");
        let held = noise::new_key_base64().unwrap();
        hub.store_secret(&instance, API_KEY, &held).await.unwrap();
        let config = Config {
            host: "127.0.0.1".into(),
            port,
            media_base: None,
            window_s: default_window(),
            wake_words: Vec::new(),
            mac: Some("AA:BB:CC:DD:EE:FF".into()),
            logs: "none".into(),
        };
        let cancel = CancellationToken::new();
        spawn_driver(
            &hub,
            instance.clone(),
            Arc::new(Esphome::new(config)),
            cancel.clone(),
        );
        let mut waiting = None;
        for _ in 0..500 {
            let status = hub
                .snapshot()
                .drivers
                .into_iter()
                .find(|d| d.instance == instance)
                .map(|d| d.status);
            if let Some(DriverStatus::Waiting { reason }) = status {
                waiting = Some(reason);
                break;
            }
            if given.load(Ordering::SeqCst) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        cancel.cancel();
        let _ = std::fs::remove_file(&vault);
        assert!(!given.load(Ordering::SeqCst), "no key sent to it");
        assert_eq!(
            hub.secret(&instance, API_KEY),
            Some(held),
            "the key Moli holds stays"
        );
        let reason = waiting.expect("a person is asked");
        assert!(
            reason.contains("moli-os secrets forget voix api_key"),
            "{reason}"
        );
    }

    #[test]
    fn only_the_wake_words_the_firmware_has_are_set() {
        let wanted = owned(&["hey_moli", "dis_moli"]);
        // The official firmware: none of ours, nothing set (it would go deaf).
        let official = ["okay_nabu", "hey_jarvis", "hey_mycroft", "stop"];
        assert_eq!(
            words_to_set(&wanted, &official, &owned(&["okay_nabu"])),
            None
        );
        // Ours: both, unless they are already active.
        let ours = ["hey_moli", "dis_moli", "stop"];
        assert_eq!(
            words_to_set(&wanted, &ours, &owned(&["hey_moli"])),
            Some(vec!["hey_moli", "dis_moli"])
        );
        assert_eq!(
            words_to_set(&wanted, &ours, &owned(&["dis_moli", "hey_moli"])),
            None
        );
        // A firmware with only one of them: that one.
        assert_eq!(
            words_to_set(&wanted, &["hey_moli"], &owned(&[])),
            Some(vec!["hey_moli"])
        );
    }
}
