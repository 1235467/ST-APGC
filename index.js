import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { oai_settings, chat_completion_sources } from '../../../openai.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { eventSource, event_types } from '../../../events.js';
import { yaml } from '../../../../lib.js';

// =============================================
// Settings
// =============================================

const defaultSettings = {
    claude: {
        include_body: '',
        exclude_body: '',
        include_headers: '',
    },
    google: {
        include_body: '',
        exclude_body: '',
        include_headers: '',
    },
};

const settings = structuredClone(defaultSettings);
Object.assign(settings, extension_settings.gcAdditionalParams ?? {});
if (!settings.claude) settings.claude = structuredClone(defaultSettings.claude);
if (!settings.google) settings.google = structuredClone(defaultSettings.google);

function saveSettings() {
    extension_settings.gcAdditionalParams = settings;
    saveSettingsDebounced();
}

// =============================================
// YAML helpers
// =============================================

function parseYamlObject(yamlStr) {
    if (!yamlStr || !yamlStr.trim()) return {};
    try {
        const parsed = yaml.parse(yamlStr);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        console.warn('[GCAP] Failed to parse YAML object:', e);
        return {};
    }
}

function parseYamlArray(yamlStr) {
    if (!yamlStr || !yamlStr.trim()) return [];
    try {
        const parsed = yaml.parse(yamlStr);
        if (Array.isArray(parsed)) return parsed.map(String);
        return yamlStr.split('\n').map(s => s.replace(/^-\s*/, '').trim()).filter(Boolean);
    } catch (e) {
        console.warn('[GCAP] Failed to parse YAML array:', e);
        return yamlStr.split('\n').map(s => s.replace(/^-\s*/, '').trim()).filter(Boolean);
    }
}

// =============================================
// Provider → source mapping
// =============================================

const providerSourceMap = {
    claude: [chat_completion_sources.CLAUDE],
    google: [chat_completion_sources.MAKERSUITE, chat_completion_sources.VERTEXAI],
};

function getCurrentProviderKey() {
    const src = oai_settings.chat_completion_source;
    for (const [key, sources] of Object.entries(providerSourceMap)) {
        if (sources.includes(src)) return /** @type {'claude'|'google'} */ (key);
    }
    return null;
}

// =============================================
// Intercept generate_data
// =============================================

eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, (/** @type {object} */ generateData) => {
    const providerKey = getCurrentProviderKey();
    if (!providerKey) return;

    const cfg = settings[providerKey];
    if (!cfg) return;

    const includeObj = parseYamlObject(cfg.include_body);
    if (Object.keys(includeObj).length) {
        Object.assign(generateData, includeObj);
        console.debug('[GCAP] Merged include_body into generate_data:', includeObj);
    }

    const excludeKeys = parseYamlArray(cfg.exclude_body);
    for (const key of excludeKeys) {
        if (key in generateData) {
            delete generateData[key];
            console.debug('[GCAP] Excluded key from generate_data:', key);
        }
    }

    if (cfg.include_headers && cfg.include_headers.trim()) {
        generateData.custom_include_headers = cfg.include_headers;
        console.debug('[GCAP] Set custom_include_headers on generate_data');
    }
});

// =============================================
// Popup builder
// =============================================

function getProviderLabel() {
    const key = getCurrentProviderKey();
    if (key === 'claude') return 'Claude';
    if (key === 'google') return 'Google';
    // Fallback: detect from oai_settings directly
    const src = oai_settings.chat_completion_source;
    if (src === chat_completion_sources.CLAUDE) return 'Claude';
    if (src === chat_completion_sources.MAKERSUITE) return 'Google AI Studio';
    if (src === chat_completion_sources.VERTEXAI) return 'Vertex AI';
    return 'Unknown';
}

async function onAdditionalParametersClick() {
    const providerKey = getCurrentProviderKey();
    if (!providerKey) return;

    const cfg = settings[providerKey];
    const label = getProviderLabel();

    // Build popup DOM
    const dom = document.createElement('div');
    dom.classList.add('gcap--popup');

    const header = document.createElement('h3');
    header.textContent = `Additional Parameters: ${label}`;
    dom.append(header);

    // --- Include Body ---
    const sec1 = document.createElement('div');
    sec1.classList.add('gcap--section');
    const h4_1 = document.createElement('h4');
    h4_1.textContent = 'Include Body Parameters';
    sec1.append(h4_1);
    const ta1 = document.createElement('textarea');
    ta1.classList.add('text_pole');
    ta1.rows = 6;
    ta1.placeholder =
        'Parameters to be merged into the request body (YAML object)\n\n' +
        'Example:\n' +
        'top_k: 20\n' +
        'repetition_penalty: 1.1';
    ta1.value = cfg.include_body || '';
    sec1.append(ta1);
    dom.append(sec1);

    // --- Exclude Body ---
    const sec2 = document.createElement('div');
    sec2.classList.add('gcap--section');
    const h4_2 = document.createElement('h4');
    h4_2.textContent = 'Exclude Body Parameters';
    sec2.append(h4_2);
    const ta2 = document.createElement('textarea');
    ta2.classList.add('text_pole');
    ta2.rows = 4;
    ta2.placeholder =
        'Parameters to be removed from the request body (YAML array)\n\n' +
        'Example:\n' +
        '- frequency_penalty\n' +
        '- presence_penalty';
    ta2.value = cfg.exclude_body || '';
    sec2.append(ta2);
    dom.append(sec2);

    // --- Include Headers ---
    const sec3 = document.createElement('div');
    sec3.classList.add('gcap--section');
    const h4_3 = document.createElement('h4');
    h4_3.textContent = 'Include Request Headers';
    sec3.append(h4_3);
    const ta3 = document.createElement('textarea');
    ta3.classList.add('text_pole');
    ta3.rows = 4;
    ta3.placeholder =
        'Additional headers for API requests (YAML object)\n\n' +
        'Example:\n' +
        'anthropic-beta: max-tokens-3-5-sonnet-2024-07-15';
    ta3.value = cfg.include_headers || '';
    sec3.append(ta3);
    dom.append(sec3);

    // Show popup
    const result = await callGenericPopup(dom, POPUP_TYPE.TEXT, null, {
        okButton: 'Save',
        wide: true,
        large: true,
    });

    if (result === POPUP_RESULT.AFFIRMATIVE) {
        cfg.include_body = ta1.value;
        cfg.exclude_body = ta2.value;
        cfg.include_headers = ta3.value;
        saveSettings();
    }
}

// =============================================
// UI – inject button into the shared button bar
// =============================================

// The target is the flex-container that holds Connect / Cancel / Additional Parameters (custom) / Test Message.
// We insert a new button right before #test_api_button, with data-source so ST toggles it automatically.
const testBtn = document.querySelector('#test_api_button');
if (testBtn) {
    const btn = document.createElement('div');
    btn.id = 'gcap_additional_parameters';
    // data-source accepts comma-separated values; ST's toggleChatCompletionForms() handles visibility
    btn.setAttribute('data-source', 'claude,makersuite,vertexai');
    btn.classList.add('menu_button', 'menu_button_icon');
    btn.textContent = 'Additional Parameters';
    btn.addEventListener('click', onAdditionalParametersClick);
    testBtn.parentElement.insertBefore(btn, testBtn);
} else {
    console.warn('[GCAP] Could not find #test_api_button to inject Additional Parameters button');
}
