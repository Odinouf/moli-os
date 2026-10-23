//! The ESPHome API messages Moli uses (identifiers and field numbers of
//! `api.proto`, ESPHome 2026.3). Plain functions: a message is built or read
//! where it is needed.

use moli_net::proto::{Fields, Writer, parse};

pub const HELLO_REQUEST: u16 = 1;
pub const HELLO_RESPONSE: u16 = 2;
pub const DISCONNECT_REQUEST: u16 = 5;
pub const DISCONNECT_RESPONSE: u16 = 6;
pub const PING_REQUEST: u16 = 7;
pub const PING_RESPONSE: u16 = 8;
pub const DEVICE_INFO_REQUEST: u16 = 9;
pub const DEVICE_INFO_RESPONSE: u16 = 10;
pub const LIST_ENTITIES_REQUEST: u16 = 11;
pub const LIST_ENTITIES_DONE: u16 = 19;
pub const SUBSCRIBE_STATES: u16 = 20;

/// The entity kinds Moli reads beyond the voice satellite's own.
pub const LIST_BINARY_SENSOR: u16 = 12;
pub const BINARY_SENSOR_STATE: u16 = 21;
pub const LIST_LIGHT: u16 = 15;
pub const LIGHT_STATE: u16 = 24;
pub const LIST_SENSOR: u16 = 16;
pub const SENSOR_STATE: u16 = 25;
pub const LIST_SWITCH: u16 = 17;
pub const SWITCH_STATE: u16 = 26;
pub const LIST_TEXT_SENSOR: u16 = 18;
pub const TEXT_SENSOR_STATE: u16 = 27;
pub const LIST_NUMBER: u16 = 49;
pub const NUMBER_STATE: u16 = 50;
pub const LIST_SELECT: u16 = 52;
pub const SELECT_STATE: u16 = 53;
pub const LIST_BUTTON: u16 = 61;
pub const LIST_CAMERA: u16 = 43;
pub const CAMERA_IMAGE: u16 = 44;
pub const CAMERA_IMAGE_REQUEST: u16 = 45;
pub const SWITCH_COMMAND: u16 = 33;
pub const LIGHT_COMMAND: u16 = 32;
pub const NUMBER_COMMAND: u16 = 51;
pub const SELECT_COMMAND: u16 = 54;
pub const BUTTON_COMMAND: u16 = 62;
pub const SUBSCRIBE_LOGS: u16 = 28;
pub const LOG: u16 = 29;
pub const LIST_MEDIA_PLAYER: u16 = 63;
pub const MEDIA_PLAYER_STATE: u16 = 64;
pub const MEDIA_PLAYER_COMMAND: u16 = 65;
pub const LIST_EVENT: u16 = 107;
pub const EVENT: u16 = 108;
pub const SUBSCRIBE_VOICE_ASSISTANT: u16 = 89;
pub const VOICE_REQUEST: u16 = 90;
pub const VOICE_RESPONSE: u16 = 91;
pub const VOICE_EVENT: u16 = 92;
pub const VOICE_AUDIO: u16 = 106;
pub const VOICE_ANNOUNCE_FINISHED: u16 = 120;
pub const VOICE_CONFIGURATION_REQUEST: u16 = 121;
pub const VOICE_CONFIGURATION_RESPONSE: u16 = 122;
pub const VOICE_SET_CONFIGURATION: u16 = 123;
pub const NOISE_SET_KEY_REQUEST: u16 = 124;
pub const NOISE_SET_KEY_RESPONSE: u16 = 125;

/// The voice pipeline's events, as the device reacts to them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VoiceEvent {
    Error = 0,
    RunStart = 1,
    RunEnd = 2,
    SttStart = 3,
    SttEnd = 4,
    IntentStart = 5,
    IntentEnd = 6,
    TtsStart = 7,
    TtsEnd = 8,
    SttVadStart = 11,
    SttVadEnd = 12,
}

/// The API version Moli speaks (the device warns below 1.14).
const API_MAJOR: u64 = 1;
const API_MINOR: u64 = 14;

#[must_use]
pub fn hello() -> Vec<u8> {
    Writer::new()
        .str(1, "Moli OS")
        .uint(2, API_MAJOR)
        .uint(3, API_MINOR)
        .finish()
}

/// What the device says of itself (`DeviceInfoResponse`).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DeviceInfo {
    pub name: String,
    pub friendly_name: String,
    pub mac: String,
    pub esphome_version: String,
    pub model: String,
    pub manufacturer: String,
    pub project: String,
    pub project_version: String,
    pub voice_flags: u32,
    /// It can take an encryption key from a client (pi: encryption: without a key).
    pub encryption_supported: bool,
}

#[must_use]
pub fn device_info(payload: &[u8]) -> Option<DeviceInfo> {
    let m = parse(payload)?;
    let text = |n| m.str(n).unwrap_or_default().to_owned();
    Some(DeviceInfo {
        name: text(2),
        mac: text(3),
        esphome_version: text(4),
        model: text(6),
        project: text(8),
        project_version: text(9),
        manufacturer: text(12),
        friendly_name: text(13),
        voice_flags: u32::try_from(m.uint(17).unwrap_or(0)).unwrap_or(0),
        encryption_supported: m.bool(19),
    })
}

/// NoiseEncryptionSetKeyRequest: the key in base64 (the device decodes it).
#[must_use]
pub fn set_key(key_base64: &str) -> Vec<u8> {
    Writer::new().str(1, key_base64).finish()
}

/// An entity of interest: its key (the handle of every later message) and name.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Entity {
    pub key: u32,
    pub name: String,
}

/// `ListEntitiesMediaPlayerResponse` or `ListEntitiesEventResponse`: key 2, name 3.
#[must_use]
pub fn entity(payload: &[u8]) -> Option<Entity> {
    let m = parse(payload)?;
    Some(Entity {
        key: m.fixed32(2)?,
        name: m.str(3).unwrap_or_default().to_owned(),
    })
}

/// The entity kinds Moli reads beyond the voice satellite's own.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EntityKind {
    BinarySensor,
    Sensor,
    Switch,
    TextSensor,
    Light,
    Number,
    Select,
    Button,
    Camera,
}

/// One entity as the device lists it: what Moli publishes as a point.
/// Field numbers differ per kind (`api.proto`), hence `kind`.
#[derive(Clone, Debug, PartialEq)]
pub struct EntityInfo {
    pub key: u32,
    pub object_id: String,
    pub name: String,
    pub unit: Option<String>,
    pub device_class: Option<String>,
    pub min: Option<f32>,
    pub max: Option<f32>,
    pub step: Option<f32>,
    pub options: Vec<String>,
}

fn text_of(m: &Fields<'_>, n: u32) -> Option<String> {
    m.str(n).map(str::to_owned).filter(|s| !s.is_empty())
}

#[must_use]
pub fn entity_info(kind: EntityKind, payload: &[u8]) -> Option<EntityInfo> {
    let m = parse(payload)?;
    let mut info = EntityInfo {
        key: m.fixed32(2)?,
        object_id: m.str(1).unwrap_or_default().to_owned(),
        name: m.str(3).unwrap_or_default().to_owned(),
        unit: None,
        device_class: None,
        min: None,
        max: None,
        step: None,
        options: Vec::new(),
    };
    match kind {
        EntityKind::BinarySensor => info.device_class = text_of(&m, 5),
        EntityKind::Sensor => {
            info.unit = text_of(&m, 6);
            info.device_class = text_of(&m, 9);
        }
        EntityKind::TextSensor => info.device_class = text_of(&m, 8),
        EntityKind::Switch | EntityKind::Button => info.device_class = text_of(&m, 9),
        EntityKind::Number => {
            info.min = m.float(6);
            info.max = m.float(7);
            info.step = m.float(8);
            info.unit = text_of(&m, 11);
            info.device_class = text_of(&m, 13);
        }
        EntityKind::Select => {
            info.options = m
                .all_bytes(6)
                .map(|b| String::from_utf8_lossy(b).into_owned())
                .collect();
        }
        EntityKind::Light | EntityKind::Camera => {}
    }
    Some(info)
}

/// A value a device reported for one of its entities.
#[derive(Clone, Debug, PartialEq)]
pub enum StateValue {
    Bool(bool),
    Float(f32),
    Text(String),
}

/// One state message: which entity (its key), its value, and whether the
/// device says it has no valid value yet.
#[derive(Clone, Debug, PartialEq)]
pub struct EntityState {
    pub key: u32,
    pub value: StateValue,
    pub missing: bool,
}

/// `BinarySensorStateResponse`: key 1, state 2, missing 3.
#[must_use]
pub fn binary_state(payload: &[u8]) -> Option<EntityState> {
    let m = parse(payload)?;
    Some(EntityState {
        key: m.fixed32(1)?,
        value: StateValue::Bool(m.bool(2)),
        missing: m.bool(3),
    })
}

/// `SwitchStateResponse`: key 1, state 2, missing 4.
#[must_use]
pub fn switch_state(payload: &[u8]) -> Option<EntityState> {
    let m = parse(payload)?;
    Some(EntityState {
        key: m.fixed32(1)?,
        value: StateValue::Bool(m.bool(2)),
        missing: m.bool(4),
    })
}

/// `SensorStateResponse` / `NumberStateResponse`: key 1, state 2, missing 3.
#[must_use]
pub fn sensor_state(payload: &[u8]) -> Option<EntityState> {
    let m = parse(payload)?;
    Some(EntityState {
        key: m.fixed32(1)?,
        value: StateValue::Float(m.float(2).unwrap_or(0.0)),
        missing: m.bool(3),
    })
}

/// `TextSensorStateResponse` / `SelectStateResponse`: key 1, state 2, missing 3.
#[must_use]
pub fn text_state(payload: &[u8]) -> Option<EntityState> {
    let m = parse(payload)?;
    Some(EntityState {
        key: m.fixed32(1)?,
        value: StateValue::Text(m.str(2).unwrap_or_default().to_owned()),
        missing: m.bool(3),
    })
}

/// `LightStateResponse`: key 1, on/off 2, brightness 3 (0 to 1, 0 when off).
#[must_use]
pub fn light_state(payload: &[u8]) -> Option<(EntityState, Option<f32>)> {
    let m = parse(payload)?;
    let on = m.bool(2);
    let brightness = m.float(3);
    Some((
        EntityState {
            key: m.fixed32(1)?,
            value: StateValue::Bool(on),
            missing: false,
        },
        brightness,
    ))
}

/// `CameraImageResponse`: key 1, data 2, done 3.
#[must_use]
pub fn camera_image(payload: &[u8]) -> Option<(u32, Vec<u8>, bool)> {
    let m = parse(payload)?;
    Some((
        m.fixed32(1)?,
        m.bytes(2).map(<[u8]>::to_vec).unwrap_or_default(),
        m.bool(3),
    ))
}

/// `SwitchCommandRequest`: key 1, state 2.
#[must_use]
pub fn switch_command(key: u32, state: bool) -> Vec<u8> {
    Writer::new().fixed32(1, key).bool(2, state).finish()
}

/// `LightCommandRequest`: key 1, has_state 2, state 3.
#[must_use]
pub fn light_command(key: u32, state: bool) -> Vec<u8> {
    Writer::new()
        .fixed32(1, key)
        .bool(2, true)
        .bool(3, state)
        .finish()
}

/// `NumberCommandRequest`: key 1, state 2.
#[must_use]
pub fn number_command(key: u32, state: f32) -> Vec<u8> {
    Writer::new().fixed32(1, key).float(2, state).finish()
}

/// `SelectCommandRequest`: key 1, state 2.
#[must_use]
pub fn select_command(key: u32, option: &str) -> Vec<u8> {
    Writer::new().fixed32(1, key).str(2, option).finish()
}

/// `ButtonCommandRequest`: key 1.
#[must_use]
pub fn button_command(key: u32) -> Vec<u8> {
    Writer::new().fixed32(1, key).finish()
}

/// `CameraImageRequest`: a single image (`stream` false).
#[must_use]
pub fn camera_image_request(single: bool) -> Vec<u8> {
    Writer::new().bool(1, single).bool(2, !single).finish()
}

/// The media player's state: 0 none, 1 idle, 2 playing, 3 paused, 4 announcing, 5 off, 6 on.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MediaState {
    pub key: u32,
    pub state: u64,
    pub volume: f32,
    pub muted: bool,
}

#[must_use]
pub fn media_state(payload: &[u8]) -> Option<MediaState> {
    let m = parse(payload)?;
    Some(MediaState {
        key: m.fixed32(1)?,
        state: m.uint(2).unwrap_or(0),
        volume: m.float(3).unwrap_or(0.0),
        muted: m.bool(4),
    })
}

/// `MediaPlayerCommandRequest`: the volume, 0 to 1.
#[must_use]
pub fn set_volume(key: u32, volume: f32) -> Vec<u8> {
    Writer::new()
        .fixed32(1, key)
        .bool(4, true)
        .float(5, volume.clamp(0.0, 1.0))
        .finish()
}

/// `MediaPlayerCommandRequest`: play `url` as an announcement (over what
/// plays, which comes back afterwards).
#[must_use]
pub fn announce(key: u32, url: &str) -> Vec<u8> {
    Writer::new()
        .fixed32(1, key)
        .bool(6, true)
        .str(7, url)
        .bool(8, true)
        .bool(9, true)
        .finish()
}

/// `MediaPlayerCommandRequest`: mute (3) or unmute (4).
#[must_use]
pub fn set_muted(key: u32, muted: bool) -> Vec<u8> {
    Writer::new()
        .fixed32(1, key)
        .bool(2, true)
        .uint(3, if muted { 3 } else { 4 })
        .finish()
}

/// `EventResponse`: which entity, which event (`double_press`…).
#[must_use]
pub fn event(payload: &[u8]) -> Option<(u32, String)> {
    let m = parse(payload)?;
    Some((m.fixed32(1)?, m.str(2).unwrap_or_default().to_owned()))
}

/// `SubscribeLogsRequest`: the device's own log, from `level` up (1 error,
/// 2 warning, 3 info, 5 debug).
#[must_use]
pub fn subscribe_logs(level: u64) -> Vec<u8> {
    Writer::new().uint(1, level).finish()
}

/// `SubscribeLogsResponse`: one line of the device's log and its level,
/// without the terminal's colours.
#[must_use]
pub fn log_line(payload: &[u8]) -> Option<(u64, String)> {
    let m = parse(payload)?;
    let raw = String::from_utf8_lossy(m.bytes(3)?).into_owned();
    let mut plain = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            // An escape sequence: up to its final letter.
            for e in chars.by_ref() {
                if e.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            plain.push(c);
        }
    }
    Some((m.uint(1).unwrap_or(0), plain.trim().to_owned()))
}

/// `SubscribeVoiceAssistantRequest`: Moli is the device's voice assistant.
#[must_use]
pub fn subscribe_voice() -> Vec<u8> {
    Writer::new().bool(1, true).finish()
}

/// The device starts (a wake word, its button, a continued conversation) or stops.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct VoiceRequest {
    pub start: bool,
    pub conversation_id: String,
    pub flags: u64,
    pub wake_word: String,
}

#[must_use]
pub fn voice_request(payload: &[u8]) -> Option<VoiceRequest> {
    let m = parse(payload)?;
    Some(VoiceRequest {
        start: m.bool(1),
        conversation_id: m.str(2).unwrap_or_default().to_owned(),
        flags: m.uint(3).unwrap_or(0),
        wake_word: m.str(5).unwrap_or_default().to_owned(),
    })
}

/// `VoiceAssistantResponse`: port 0 = the audio comes through the API; or an error.
#[must_use]
pub fn voice_response(error: bool) -> Vec<u8> {
    if error {
        Writer::new().bool(2, true).finish()
    } else {
        Writer::new().uint(1, 0).finish()
    }
}

/// `VoiceAssistantEventResponse` with its data (always strings).
#[must_use]
pub fn voice_event(event: VoiceEvent, data: &[(&str, &str)]) -> Vec<u8> {
    let mut w = Writer::new().uint(1, event as u64);
    for (name, value) in data {
        w = w.msg(2, Writer::new().str(1, name).str(2, value));
    }
    w.finish()
}

/// The microphone's audio (16 kHz, 16-bit, mono, little-endian).
#[must_use]
pub fn voice_audio(payload: &[u8]) -> Option<Vec<u8>> {
    parse(payload)?.bytes(1).map(<[u8]>::to_vec)
}

/// The wake words the device has, the active ones, and how many may be.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct WakeWords {
    pub available: Vec<(String, String)>,
    pub active: Vec<String>,
    pub max_active: u64,
}

#[must_use]
pub fn wake_words(payload: &[u8]) -> Option<WakeWords> {
    let m = parse(payload)?;
    Some(WakeWords {
        available: m
            .all_msgs(1)
            .map(|w| {
                (
                    w.str(1).unwrap_or_default().to_owned(),
                    w.str(2).unwrap_or_default().to_owned(),
                )
            })
            .collect(),
        active: m
            .all_bytes(2)
            .map(|b| String::from_utf8_lossy(b).into_owned())
            .collect(),
        max_active: m.uint(3).unwrap_or(0),
    })
}

/// `VoiceAssistantSetConfiguration`: these wake words, and only these, active.
#[must_use]
pub fn set_wake_words(ids: &[&str]) -> Vec<u8> {
    ids.iter()
        .fold(Writer::new(), |w, id| w.str(1, id))
        .finish()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_kinds_are_read_with_their_fields() {
        let listed = Writer::new()
            .str(1, "radar_target")
            .fixed32(2, 42)
            .str(3, "Radar Target")
            .str(5, "motion")
            .finish();
        let info = entity_info(EntityKind::BinarySensor, &listed).unwrap();
        assert_eq!(info.key, 42);
        assert_eq!(info.object_id, "radar_target");
        assert_eq!(info.name, "Radar Target");
        assert_eq!(info.device_class.as_deref(), Some("motion"));

        let sensor = Writer::new()
            .str(1, "detection_distance")
            .fixed32(2, 7)
            .str(3, "Detection Distance")
            .str(6, "cm")
            .str(9, "distance")
            .finish();
        let info = entity_info(EntityKind::Sensor, &sensor).unwrap();
        assert_eq!(info.unit.as_deref(), Some("cm"));
        assert_eq!(info.device_class.as_deref(), Some("distance"));

        let number = Writer::new()
            .str(1, "end_zone_1")
            .fixed32(2, 9)
            .str(3, "End Zone 1")
            .float(6, 0.0)
            .float(7, 600.0)
            .float(8, 10.0)
            .finish();
        let info = entity_info(EntityKind::Number, &number).unwrap();
        assert_eq!((info.min, info.max, info.step), (Some(0.0), Some(600.0), Some(10.0)));

        let select = Writer::new()
            .str(1, "assistant")
            .fixed32(2, 3)
            .str(3, "Assistant")
            .str(6, "NABU Enfant")
            .str(6, "Home Assistant")
            .finish();
        let info = entity_info(EntityKind::Select, &select).unwrap();
        assert_eq!(info.options, ["NABU Enfant", "Home Assistant"]);
    }

    #[test]
    fn states_and_commands_round_trip() {
        let binary = Writer::new().fixed32(1, 5).bool(2, true).finish();
        assert_eq!(
            binary_state(&binary),
            Some(EntityState {
                key: 5,
                value: StateValue::Bool(true),
                missing: false
            })
        );
        let sensor = Writer::new()
            .fixed32(1, 5)
            .float(2, 44.9)
            .bool(3, true)
            .finish();
        match sensor_state(&sensor).unwrap() {
            EntityState {
                value: StateValue::Float(v),
                missing: true,
                ..
            } => assert!((v - 44.9).abs() < 0.001),
            other => panic!("{other:?}"),
        }
        let text = Writer::new().fixed32(1, 5).str(2, "NABU Enfant").finish();
        assert_eq!(
            text_state(&text),
            Some(EntityState {
                key: 5,
                value: StateValue::Text("NABU Enfant".into()),
                missing: false
            })
        );
        let light = Writer::new()
            .fixed32(1, 5)
            .bool(2, true)
            .float(3, 0.8)
            .finish();
        let (state, brightness) = light_state(&light).unwrap();
        assert_eq!(state.value, StateValue::Bool(true));
        assert!((brightness.unwrap() - 0.8).abs() < 0.001);

        assert_eq!(
            parse(&switch_command(7, true)).unwrap().fixed32(1),
            Some(7)
        );
        let light_buf = light_command(7, false);
        let light_cmd = parse(&light_buf).unwrap();
        assert_eq!((light_cmd.fixed32(1), light_cmd.bool(2), light_cmd.bool(3)), (Some(7), true, false));
        assert_eq!(parse(&number_command(7, 250.0)).unwrap().float(2), Some(250.0));
        assert_eq!(parse(&select_command(7, "X")).unwrap().str(2), Some("X"));
        assert_eq!(parse(&button_command(7)).unwrap().fixed32(1), Some(7));
        let cam_buf = camera_image_request(true);
        let cam = parse(&cam_buf).unwrap();
        assert_eq!((cam.bool(1), cam.bool(2)), (true, false));
        let image = Writer::new().fixed32(1, 9).bytes(2, &[1, 2, 3]).bool(3, true).finish();
        assert_eq!(camera_image(&image), Some((9, vec![1, 2, 3], true)));
    }

    #[test]
    fn voice_messages() {
        let request = Writer::new()
            .bool(1, true)
            .str(2, "conv-1")
            .uint(3, 1)
            .str(5, "Okay Nabu")
            .finish();
        assert_eq!(
            voice_request(&request),
            Some(VoiceRequest {
                start: true,
                conversation_id: "conv-1".into(),
                flags: 1,
                wake_word: "Okay Nabu".into()
            })
        );
        let ok = voice_response(false);
        let ok = parse(&ok).unwrap();
        assert_eq!((ok.uint(1), ok.bool(2)), (Some(0), false));
        let event = voice_event(
            VoiceEvent::IntentEnd,
            &[("conversation_id", "c"), ("continue_conversation", "1")],
        );
        let event = parse(&event).unwrap();
        assert_eq!(event.uint(1), Some(6));
        let data: Vec<_> = event
            .all_msgs(2)
            .map(|d| (d.str(1).unwrap().to_owned(), d.str(2).unwrap().to_owned()))
            .collect();
        assert_eq!(data[1], ("continue_conversation".into(), "1".into()));
        let audio = Writer::new().bytes(1, &[1, 2, 3, 4]).finish();
        assert_eq!(voice_audio(&audio), Some(vec![1, 2, 3, 4]));
        let config = Writer::new()
            .msg(1, Writer::new().str(1, "okay_nabu").str(2, "Okay Nabu"))
            .msg(1, Writer::new().str(1, "hey_jarvis").str(2, "Hey Jarvis"))
            .str(2, "okay_nabu")
            .uint(3, 2)
            .finish();
        let words = wake_words(&config).unwrap();
        assert_eq!(words.available.len(), 2);
        assert_eq!(words.active, ["okay_nabu"]);
        assert_eq!(words.max_active, 2);
        let set = set_wake_words(&["hey_moli", "dis_moli"]);
        let set = parse(&set).unwrap();
        assert_eq!(set.all_bytes(1).count(), 2);
    }

    #[test]
    fn hello_announces_moli_and_api_1_14() {
        let bytes = hello();
        let m = parse(&bytes).unwrap();
        assert_eq!(m.str(1), Some("Moli OS"));
        assert_eq!((m.uint(2), m.uint(3)), (Some(1), Some(14)));
    }

    #[test]
    fn device_info_is_read() {
        let payload = Writer::new()
            .str(2, "home-assistant-voice-0a8ccb")
            .str(3, "AA:BB:CC:DD:EE:FF")
            .str(4, "2026.3.2")
            .str(6, "Home Assistant Voice PE")
            .str(13, "Home Assistant Voice 0a8ccb")
            .uint(17, 61)
            .finish();
        let info = device_info(&payload).unwrap();
        assert_eq!(info.friendly_name, "Home Assistant Voice 0a8ccb");
        assert_eq!(info.voice_flags, 61);
        assert_eq!(info.esphome_version, "2026.3.2");
    }

    #[test]
    fn device_log_lines_lose_their_colours() {
        let line = Writer::new()
            .uint(1, 2)
            .bytes(3, b"\x1b[0;33m[W][speaker_media_player:123]: Failed\x1b[0m")
            .finish();
        assert_eq!(
            log_line(&line),
            Some((2, "[W][speaker_media_player:123]: Failed".to_owned()))
        );
        assert_eq!(parse(&subscribe_logs(3)).unwrap().uint(1), Some(3));
    }

    #[test]
    fn an_announcement_is_a_url_marked_as_one() {
        let message = announce(7, "http://moli/api/voice/a.wav");
        let m = parse(&message).unwrap();
        assert_eq!(m.fixed32(1), Some(7));
        assert_eq!(m.str(7), Some("http://moli/api/voice/a.wav"));
    }

    #[test]
    fn media_player_messages() {
        let listed = Writer::new()
            .fixed32(2, 0x1234_5678)
            .str(3, "Media Player")
            .finish();
        assert_eq!(
            entity(&listed),
            Some(Entity {
                key: 0x1234_5678,
                name: "Media Player".into()
            })
        );
        let state = Writer::new()
            .fixed32(1, 7)
            .uint(2, 1)
            .float(3, 0.5)
            .bool(4, false)
            .finish();
        assert_eq!(
            media_state(&state),
            Some(MediaState {
                key: 7,
                state: 1,
                volume: 0.5,
                muted: false
            })
        );
        let bytes = set_volume(7, 1.7);
        let command = parse(&bytes).unwrap();
        assert_eq!(command.fixed32(1), Some(7));
        assert!(command.bool(4));
        assert_eq!(command.float(5), Some(1.0), "clamped");
        let bytes = set_muted(7, true);
        let mute = parse(&bytes).unwrap();
        assert_eq!((mute.bool(2), mute.uint(3)), (true, Some(3)));
    }
}
