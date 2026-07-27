import { extension_settings } from '../../../extensions.js';
import { oai_settings } from '../../../openai.js';
import { callGenericPopup, POPUP_TYPE, POPUP_RESULT } from '../../../popup.js';
import { translate } from '../../../i18n.js';
import { parse as parseYaml } from './vendor/yaml.js';

const SETTINGS_KEY = 'gcAdditionalParams';
const SETTINGS_FIELDS = ['include_body', 'exclude_body', 'include_headers'];

/**
 * Each entry owns one persisted settings object. Google AI Studio and Vertex AI
 * deliberately share the `google` object, while every other source is isolated.
 */
const PROVIDERS = [
    {
        key: 'claude',
        sources: [{ value: 'claude', label: 'Claude' }],
    },
    {
        key: 'google',
        sources: [
            { value: 'makersuite', label: 'Google AI Studio' },
            { value: 'vertexai', label: 'Vertex AI' },
        ],
    },
    {
        key: 'deepseek',
        sources: [{ value: 'deepseek', label: 'DeepSeek' }],
    },
    {
        key: 'zai',
        sources: [{ value: 'zai', label: 'Z.AI' }],
    },
    {
        key: 'moonshot',
        sources: [{ value: 'moonshot', label: 'Moonshot AI' }],
    },
    {
        key: 'xai',
        sources: [{ value: 'xai', label: 'xAI' }],
    },
    {
        key: 'openrouter',
        sources: [{ value: 'openrouter', label: 'OpenRouter' }],
    },
];

let saveSettingsDebounced;
let additionalParametersButton;

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getSettings() {
    const storedSettings = extension_settings[SETTINGS_KEY];
    const settings = isPlainObject(storedSettings) ? storedSettings : {};

    for (const provider of PROVIDERS) {
        if (!isPlainObject(settings[provider.key])) {
            settings[provider.key] = {};
        }

        for (const field of SETTINGS_FIELDS) {
            if (settings[provider.key][field] === undefined) {
                settings[provider.key][field] = '';
            }
        }
    }

    return settings;
}

const settings = getSettings();

function saveSettings() {
    extension_settings[SETTINGS_KEY] = settings;
    saveSettingsDebounced();
}

function parseYamlObject(yamlString) {
    if (!yamlString || !yamlString.trim()) {
        return {};
    }

    try {
        const parsed = parseYaml(yamlString);
        return isPlainObject(parsed) ? parsed : {};
    } catch (error) {
        console.warn('[GCAP] Failed to parse YAML object:', error);
        return {};
    }
}

function parseYamlArray(yamlString) {
    if (!yamlString || !yamlString.trim()) {
        return [];
    }

    try {
        const parsed = parseYaml(yamlString);
        if (Array.isArray(parsed)) {
            return parsed.map(String);
        }
    } catch (error) {
        console.warn('[GCAP] Failed to parse YAML array:', error);
    }

    return yamlString
        .split('\n')
        .map(line => line.replace(/^-\s*/, '').trim())
        .filter(Boolean);
}

function getCurrentProvider() {
    const currentSource = oai_settings.chat_completion_source;
    return PROVIDERS.find(provider => provider.sources.some(source => source.value === currentSource)) ?? null;
}

function getCurrentProviderLabel(provider) {
    const currentSource = oai_settings.chat_completion_source;
    return provider.sources.find(source => source.value === currentSource)?.label ?? provider.sources[0].label;
}

function refreshButtonVisibility() {
    if (additionalParametersButton) {
        additionalParametersButton.hidden = !getCurrentProvider();
    }
}

function applyAdditionalParameters(generateData) {
    const provider = getCurrentProvider();
    if (!provider) {
        return;
    }

    const config = settings[provider.key];
    if (!config) {
        return;
    }

    const includeObject = parseYamlObject(config.include_body);
    if (Object.keys(includeObject).length) {
        Object.assign(generateData, includeObject);
        console.debug('[GCAP] Merged include_body into generate_data:', includeObject);
    }

    for (const key of parseYamlArray(config.exclude_body)) {
        if (key in generateData) {
            delete generateData[key];
            console.debug('[GCAP] Excluded key from generate_data:', key);
        }
    }

    if (config.include_headers && config.include_headers.trim()) {
        generateData.custom_include_headers = config.include_headers;
        console.debug('[GCAP] Set custom_include_headers on generate_data');
    }
}

function createSection(titleKey, descriptionKey, rows, value) {
    const section = document.createElement('div');
    section.classList.add('gcap--section');

    const heading = document.createElement('h4');
    heading.textContent = translate(titleKey);
    section.append(heading);

    const textarea = document.createElement('textarea');
    textarea.classList.add('text_pole');
    textarea.rows = rows;
    textarea.placeholder = translate(descriptionKey);
    textarea.value = value || '';
    section.append(textarea);

    return { section, textarea };
}

async function onAdditionalParametersClick() {
    const provider = getCurrentProvider();
    if (!provider) {
        return;
    }

    const config = settings[provider.key];
    const popup = document.createElement('div');
    popup.classList.add('gcap--popup');

    const heading = document.createElement('h3');
    heading.textContent = `${translate('Additional Parameters')}: ${getCurrentProviderLabel(provider)}`;
    popup.append(heading);

    const includeBody = createSection('Include Body Parameters', 'custom_include_body_desc', 6, config.include_body);
    const excludeBody = createSection('Exclude Body Parameters', 'custom_exclude_body_desc', 4, config.exclude_body);
    const includeHeaders = createSection('Include Request Headers', 'custom_include_headers_desc', 4, config.include_headers);
    popup.append(includeBody.section, excludeBody.section, includeHeaders.section);

    const result = await callGenericPopup(popup, POPUP_TYPE.TEXT, null, {
        okButton: 'Save',
        wide: true,
        large: true,
    });

    if (result === POPUP_RESULT.AFFIRMATIVE) {
        config.include_body = includeBody.textarea.value;
        config.exclude_body = excludeBody.textarea.value;
        config.include_headers = includeHeaders.textarea.value;
        saveSettings();
    }
}

function injectButton() {
    const testButton = document.querySelector('#test_api_button');
    if (!testButton) {
        console.warn('[GCAP] Could not find #test_api_button to inject Additional Parameters button');
        return;
    }

    const existingButton = document.querySelector('#gcap_additional_parameters');
    if (existingButton) {
        additionalParametersButton = existingButton;
        return;
    }

    additionalParametersButton = document.createElement('div');
    additionalParametersButton.id = 'gcap_additional_parameters';
    additionalParametersButton.classList.add('menu_button', 'menu_button_icon');
    additionalParametersButton.textContent = translate('Additional Parameters');
    additionalParametersButton.addEventListener('click', onAdditionalParametersClick);
    testButton.parentElement.insertBefore(additionalParametersButton, testButton);
}

async function getRuntimeDependencies() {
    let scriptModule;
    try {
        scriptModule = await import('/script.js');
    } catch (error) {
        console.error('[GCAP] Failed to load /script.js:', error);
        return null;
    }

    let { eventSource, event_types: eventTypes } = scriptModule;
    if (!eventSource || !eventTypes) {
        try {
            ({ eventSource, event_types: eventTypes } = await import('/scripts/events.js'));
        } catch (error) {
            console.error('[GCAP] Failed to load event dependencies:', error);
            return null;
        }
    }

    if (typeof scriptModule.saveSettingsDebounced !== 'function' || typeof eventSource?.on !== 'function') {
        console.error('[GCAP] Required SillyTavern dependencies are unavailable; extension was not initialized.');
        return null;
    }

    return {
        saveSettings: scriptModule.saveSettingsDebounced,
        eventSource,
        settingsReadyEvent: eventTypes?.CHAT_COMPLETION_SETTINGS_READY ?? 'chat_completion_settings_ready',
    };
}

async function init() {
    const dependencies = await getRuntimeDependencies();
    if (!dependencies) {
        return;
    }

    saveSettingsDebounced = dependencies.saveSettings;
    dependencies.eventSource.on(dependencies.settingsReadyEvent, applyAdditionalParameters);

    injectButton();
    refreshButtonVisibility();
    $('#chat_completion_source').off('change.gcap').on('change.gcap', refreshButtonVisibility);
}

void init();
