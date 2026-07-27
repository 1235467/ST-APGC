# Chat Completion Additional Parameters

Adds an **Additional Parameters** button to these SillyTavern Chat Completion sources:

- Claude
- Google AI Studio and Vertex AI (shared Gemini settings)
- DeepSeek
- Z.AI (GLM)
- Moonshot AI
- xAI (Grok)
- OpenRouter

Each source has its own saved configuration, except Google AI Studio and Vertex AI, which intentionally share one configuration. The button is only displayed while a supported source is selected.

## Usage

Use YAML in the popup fields:

- **Include Body Parameters** accepts a YAML object that is merged into the prepared request body.
- **Exclude Body Parameters** accepts a YAML array of request-body keys to remove.
- **Include Request Headers** accepts the additional header text used by SillyTavern's existing request setting.

Example include-body YAML:

```yaml
top_k: 20
repetition_penalty: 1.1
```

Example exclude-body YAML:

```yaml
- frequency_penalty
- presence_penalty
```

## Compatibility and scope

Requires SillyTavern 1.12.3 or later. The extension only adds a browser-side request hook: it saves this configuration and changes SillyTavern's prepared `generateData`. It does not alter SillyTavern's server routes or bypass the host version's provider-specific request handling. Whether a field or header is ultimately forwarded depends on the selected source and the SillyTavern version in use.

YAML parsing is provided by the bundled [`yaml`](https://github.com/eemeli/yaml) package (ISC license; see `vendor/yaml/LICENSE`).
