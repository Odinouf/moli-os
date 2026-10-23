//! Linky / Tempo metering, read from MQTT topics.
//!
//! Home Assistant already knows the household's electricity: the Linky
//! consumption index, the Tempo colour and off-peak flag, the whole-home
//! and apartment draws, the residual (whole home minus what is metered),
//! and the day's cost. An HA automation republishes those as retained
//! messages under `moli/linky/#`; this driver subscribes to them and turns
//! each topic into a Moli point, so the dashboard reads the same figures
//! without a Home Assistant round-trip.
//!
//! Nothing here talks to the Linky directly and nothing imports the solar
//! installation: the values come from what HA measures, and only those.

use std::time::Duration;

use anyhow::Context as _;
use moli_core::{Access, Device, DeviceId, Kind, PointSpec, Semantic, Unit, Value};
use moli_runtime::{BoxFuture, Driver, DriverCtx};
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde::Deserialize;

/// Driver configuration (`[driver.options]` in `moli.toml`).
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    #[serde(default = "default_host")]
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    /// Topic prefix the household publishes under (default `moli/linky`).
    #[serde(default = "default_base_topic")]
    pub base_topic: String,
    #[serde(default)]
    pub username: Option<String>,
    /// Name of the environment variable holding the password (never the
    /// password itself).
    #[serde(default)]
    pub password_env: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
}

fn default_host() -> String {
    "127.0.0.1".into()
}
fn default_port() -> u16 {
    1883
}
fn default_base_topic() -> String {
    "moli/linky".into()
}

#[derive(Debug)]
pub struct Linky {
    config: Config,
}

impl Linky {
    #[must_use]
    pub fn new(config: Config) -> Self {
        Self { config }
    }
}

impl Driver for Linky {
    fn kind(&self) -> &'static str {
        "linky"
    }

    fn run<'a>(&'a self, ctx: &'a mut DriverCtx) -> BoxFuture<'a, anyhow::Result<()>> {
        Box::pin(run(&self.config, ctx))
    }
}

/// One reading the household publishes, and how Moli shows it.
struct Reading {
    /// Topic tail under the base (`global_jour` → `moli/linky/global_jour`).
    topic: &'static str,
    /// Moli point key (stable; what automations and the dashboard read).
    key: &'static str,
    label: &'static str,
    kind: Kind,
    unit: Option<Unit>,
}

fn numeric(_unit: Unit, min: f64, max: f64) -> Kind {
    Kind::Numeric {
        min: Some(min),
        max: Some(max),
        step: None,
    }
}

/// The figures the dashboard needs, in one place. Every topic is optional:
/// a household that does not measure the apartment simply never publishes
/// it, and its point stays empty.
fn readings() -> Vec<Reading> {
    let kwh = || Some(Unit::KiloWattHour);
    let watt = || Some(Unit::Watt);
    let euro = || Some(Unit::Other("€".into()));
    let price = || Some(Unit::Other("€/kWh".into()));
    vec![
        Reading { topic: "global_jour", key: "conso_jour", label: "Conso jour", kind: numeric(Unit::KiloWattHour, 0.0, 100_000.0), unit: kwh() },
        Reading { topic: "appart_jour", key: "appart_jour", label: "Appartement (jour)", kind: numeric(Unit::KiloWattHour, 0.0, 100_000.0), unit: kwh() },
        Reading { topic: "residuel_jour", key: "residuel_jour", label: "Résiduel (jour)", kind: numeric(Unit::KiloWattHour, -100_000.0, 100_000.0), unit: kwh() },
        Reading { topic: "residuel_cumul", key: "residuel_cumul", label: "Résiduel cumulé", kind: numeric(Unit::KiloWattHour, 0.0, 10_000_000.0), unit: kwh() },
        Reading { topic: "index", key: "index", label: "Index Linky", kind: numeric(Unit::KiloWattHour, 0.0, 100_000_000.0), unit: kwh() },
        Reading { topic: "power_appart", key: "power_appart", label: "Puissance appartement", kind: numeric(Unit::Watt, -100_000.0, 100_000.0), unit: watt() },
        Reading { topic: "power_residuel", key: "power_residuel", label: "Puissance résiduelle", kind: numeric(Unit::Watt, -100_000.0, 100_000.0), unit: watt() },
        Reading { topic: "power_principale", key: "power_principale", label: "Puissance principale", kind: numeric(Unit::Watt, -100_000.0, 100_000.0), unit: watt() },
        Reading { topic: "cout_jour", key: "cout_jour", label: "Coût jour", kind: numeric(Unit::Other("€".into()), 0.0, 100_000.0), unit: euro() },
        Reading { topic: "cout_hier", key: "cout_hier", label: "Coût réalisé J-1", kind: numeric(Unit::Other("€".into()), 0.0, 100_000.0), unit: euro() },
        Reading { topic: "prix", key: "prix", label: "Prix actuel", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_bleu_hp", key: "prix_bleu_hp", label: "Prix bleu HP", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_bleu_hc", key: "prix_bleu_hc", label: "Prix bleu HC", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_blanc_hp", key: "prix_blanc_hp", label: "Prix blanc HP", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_blanc_hc", key: "prix_blanc_hc", label: "Prix blanc HC", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_rouge_hp", key: "prix_rouge_hp", label: "Prix rouge HP", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading { topic: "prix_rouge_hc", key: "prix_rouge_hc", label: "Prix rouge HC", kind: numeric(Unit::Other("€/kWh".into()), 0.0, 100.0), unit: price() },
        Reading {
            topic: "tempo_couleur",
            key: "tempo_couleur",
            label: "Couleur Tempo",
            kind: Kind::Enum {
                values: ["bleu", "blanc", "rouge", "inconnu"].map(Into::into).to_vec(),
            },
            unit: None,
        },
        Reading { topic: "tempo_hc", key: "tempo_hc", label: "Heures creuses", kind: Kind::Binary, unit: None },
        // The tariff period right now (Tempo colour and off-peak flag joined:
        // `bleu_hp`, `rouge_hc`, …): the key the energy meters price against.
        Reading { topic: "period", key: "period", label: "Période tarifaire", kind: Kind::Text, unit: None },
    ]
}

fn device(ctx: &DriverCtx, id: &DeviceId) -> Device {
    Device {
        id: id.clone(),
        instance: ctx.instance().clone(),
        native_name: "Linky".into(),
        manufacturer: Some("Enedis".into()),
        model: Some("Linky".into()),
        description: Some("Compteur Linky (via Home Assistant)".into()),
        native_room: None,
        members: Vec::new(),
        points: readings()
            .into_iter()
            .map(|r| PointSpec {
                key: r.key.into(),
                label: r.label.into(),
                semantic: Semantic::infer(r.key, r.unit.as_ref()),
                kind: r.kind,
                access: Access { read: true, write: false },
                unit: r.unit,
            })
            .collect(),
    }
}

/// Turns a topic tail into a value worth storing. Unknown tails are ignored
/// (a household may publish more than Moli reads). Scalars and compact JSON
/// are both accepted: `3.4`, `"bleu"`, `true`, or `{"value": 3.4}`.
fn decode(tail: &str, payload: &[u8]) -> Option<(&'static str, Value)> {
    let reading = readings().into_iter().find(|r| r.topic == tail)?;
    let text = std::str::from_utf8(payload).ok()?.trim();
    if text.is_empty() {
        return None;
    }
    let value = if text.starts_with(['{', '[']) {
        let json: serde_json::Value = serde_json::from_str(text).ok()?;
        let inner = json.get("value").unwrap_or(&json);
        Value::from_json(inner)
    } else {
        scalar(text, &reading.kind)
    };
    Some((reading.key, value))
}

/// A raw MQTT scalar, typed from the point's kind so a bool point accepts
/// `on`/`off` and a numeric one accepts `3.4`.
fn scalar(text: &str, kind: &Kind) -> Value {
    let unquoted = text.trim_matches('"');
    match kind {
        Kind::Binary => match unquoted.to_ascii_lowercase().as_str() {
            "on" | "true" | "1" | "yes" | "open" => Value::Bool(true),
            "off" | "false" | "0" | "no" | "closed" => Value::Bool(false),
            _ => Value::Text(unquoted.into()),
        },
        Kind::Enum { .. } | Kind::Text => Value::Text(unquoted.to_ascii_lowercase().into()),
        Kind::Numeric { .. } => unquoted
            .parse::<f64>()
            .map_or_else(|_| Value::Text(unquoted.into()), Value::Float),
    }
}

async fn run(config: &Config, ctx: &mut DriverCtx) -> anyhow::Result<()> {
    let client_id = config
        .client_id
        .clone()
        .unwrap_or_else(|| format!("moli-os-{}", ctx.instance()));
    let mut options = MqttOptions::new(client_id, &config.host, config.port);
    options.set_keep_alive(Duration::from_secs(30));
    if let Some(username) = &config.username {
        let password = match &config.password_env {
            Some(var) => std::env::var(var).with_context(|| format!("env var {var} not set"))?,
            None => String::new(),
        };
        options.set_credentials(username, password);
    }

    let (client, mut events) = AsyncClient::new(options, 64);
    let base = config.base_topic.trim_end_matches('/');
    let device_id = ctx.device_id("linky");
    ctx.upsert_device(device(&*ctx, &device_id));

    loop {
        tokio::select! {
            event = events.poll() => match event.context("mqtt connection")? {
                Event::Incoming(Packet::ConnAck(_)) => {
                    client.try_subscribe(format!("{base}/#"), QoS::AtLeastOnce)?;
                    tracing::info!(instance = %ctx.instance(), "connected to mqtt");
                    ctx.ready();
                }
                Event::Incoming(Packet::Publish(publish)) => {
                    let tail = publish
                        .topic
                        .strip_prefix(base)
                        .and_then(|t| t.strip_prefix('/'));
                    if let Some(tail) = tail
                        && let Some((key, value)) = decode(tail, &publish.payload)
                    {
                        ctx.set_state(&device_id, key, value);
                    }
                }
                _ => {}
            },
            command = ctx.next_command() => match command {
                Some(command) => command.reply(Err("linky is read-only".into())),
                None => return Ok(()),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn topic_tail_maps_to_a_point() {
        let (key, value) = decode("global_jour", b"1.62").unwrap();
        assert_eq!(key, "conso_jour");
        assert_eq!(value, Value::Float(1.62));
    }

    #[test]
    fn numeric_payload_parses() {
        let (_, value) = decode("power_appart", b"524").unwrap();
        assert_eq!(value, Value::Float(524.0));
        let (_, value) = decode("residuel_jour", b"-3.5").unwrap();
        assert_eq!(value, Value::Float(-3.5));
    }

    #[test]
    fn boolean_and_enum_payloads_parse() {
        let (_, value) = decode("tempo_hc", b"ON").unwrap();
        assert_eq!(value, Value::Bool(true));
        let (_, value) = decode("tempo_hc", b"off").unwrap();
        assert_eq!(value, Value::Bool(false));
        let (_, value) = decode("tempo_couleur", b"Bleu").unwrap();
        assert_eq!(value, Value::Text("bleu".into()));
    }

    #[test]
    fn json_payload_is_accepted() {
        let (key, value) = decode("cout_jour", br#"{"value": 0.26}"#).unwrap();
        assert_eq!(key, "cout_jour");
        assert_eq!(value, Value::Float(0.26));
    }

    #[test]
    fn unknown_topics_and_empty_payloads_are_ignored() {
        assert!(decode("temperature_salon", b"21.5").is_none());
        assert!(decode("global_jour", b"   ").is_none());
    }

    #[test]
    fn every_reading_has_a_unique_key() {
        let mut keys: Vec<&str> = readings().iter().map(|r| r.key).collect();
        let total = keys.len();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), total, "duplicate point key");
    }
}
