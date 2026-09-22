# Handwritten Notebook Digitizer for Obsidian

An Obsidian plugin that digitizes physical notebook pages in any language into structured Markdown notes using Google's Gemini API.

---

## Features

- **Multimodal Handwriting Recognition**: Uses current Google Gemini models, including **Gemini 3.8 Flash**, **Gemini 3.6 Flash**, **Gemini 3.5 Flash-Lite**, and **Gemini 3.1 Pro Preview**, plus custom model IDs.
- **Multilingual Handwriting & Mixed Content**: Seamlessly transcribes handwriting in any language or script, including mixed bilingual text, technical terminology, programming code, LaTeX mathematical formulas (`$E=mc^2$`), tables, and nested bullet points.
- **Handwritten Diagrams to Mermaid**: Automatically detects handwritten flowcharts, workflows, hierarchies, sequence charts, and process diagrams and converts them into native Obsidian Mermaid diagrams (````mermaid ... ````).
- **Continuous Seamless Notes**: When multiple pages are selected, they are combined into one natural, continuous Markdown note without artificial page break dividers (or optionally separated with page dividers via an in-modal toggle).
- **Automatic Image Optimization**: Downscales photos to a maximum dimension of 1920px and converts them to quality-tuned JPEGs before uploading and optionally saving them.
- **Dedicated Scans Subfolder**: Page images are stored inside a dedicated `scans/` subfolder under the note's directory by default, keeping your notes clean.
- **Collapsible Scans for Proofreading**: Optionally embeds original page scans into collapsible callouts (`> [!info]- Original scan (Page X)`) at the top of the group or per page, allowing effortless side-by-side verification.
- **Personal Gemini API Key**: Users provide their own Google Gemini API key. The key is stored through Obsidian's SecretStorage API and can be entered in the capture modal or selected in Settings.
- **Interactive Capture Modal**:
  - 📁 **File Selector / Drag & Drop**: Select multiple page images at once.
  - 📷 **Mobile Camera Capture**: Capture photos directly from your phone's camera inside Obsidian (`capture="environment"`).
  - 🖼️ **Thumbnail Preview & Reordering**: Reorder pages or remove accidental uploads before processing.
  - ⚙️ **Quick In-Modal Options**: Toggle embedding original scan callouts, separate pages with page breaks, and switch models on the fly.
- **Custom Prompt Instructions**: Add quick instructions for any batch (e.g., *"Ignore the pencil doodles on page 2"*, *"Ignore crossed-out text at the bottom"*).
- **Flexible Destination**:
  - **Create New Note**: Automatically names the note or accepts a custom title.
  - **Append to Active Note**: Add missing pages later without overwriting existing note content.

---

## Installation

### Manual installation

This plugin requires Obsidian 1.11.4 or later.

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Inside your Obsidian vault folder, navigate to:
   ```
   <Vault>/.obsidian/plugins/
   ```
3. Create a new folder named `notebook-digitizer`:
   ```
   <Vault>/.obsidian/plugins/notebook-digitizer/
   ```
4. Copy the downloaded files into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. In Obsidian, go to **Settings** > **Community plugins**, click the refresh icon, and enable **Handwritten Notebook Digitizer**.

---

## Configuration

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey). Availability, quotas, and billing depend on Google's current terms and the selected model.
2. In Obsidian, go to **Settings** > **Handwritten Notebook Digitizer**:
   - **Gemini API key**: Select or create a key using Obsidian's secret storage.
   - **Gemini model**: Select a supported model. `Gemini 3.8 Flash` is the default, or choose `Custom model` and enter an exact model ID.
   - **Scans Subfolder**: Default is `scans`. Uploaded page images are stored in a dedicated subfolder under the note's directory to keep your notes clean.
   - **Callout title**: Default is `Original scan` (or customize it to your preferred title or language).

---

## Usage

### 1. Digitize a Group of Pages (New Note)
1. Click the **Camera ribbon icon** on the left ribbon, or press `Ctrl+P` / `Cmd+P` and choose:
   `Digitize handwritten notes`
2. Click **📁 Choose images** (or drag and drop images), or **📷 Capture with camera** on mobile.
3. (Optional) Enter custom instructions for this batch.
4. (Optional) In the Options section:
   - Toggle **Add callout with original scan** (enabled by default; uncheck if you only want transcribed text without embedding or saving scans).
   - Toggle **Separate pages with page breaks** if you want explicit page dividers (`---`) instead of one continuous note.
5. Keep **Create new note** selected (or choose Append), enter a title, and click **Digitize & transcribe**.

### 2. Append Pages to an Existing Note
1. Open the note you want to add pages to.
2. Open the command palette and run:
   `Append handwritten notes to active file`
   *(or open the modal and select "Append to Active Note")*
3. Select or capture the new pages.
4. Click **Digitize & transcribe**. The new pages and their collapsible scan callouts will be cleanly appended to the end of your note with a section divider.

---

## Network use and privacy

This plugin requires network access to Google's Gemini API. When you start a transcription, the plugin sends the following directly from Obsidian to `generativelanguage.googleapis.com`:

- The selected notebook-page images after local JPEG optimization.
- The built-in transcription prompt.
- Any persistent or batch-specific instructions you entered.
- Your Gemini API key in the `x-goog-api-key` request header.

The plugin does not include analytics or telemetry and does not operate a separate server. Google processes API requests according to the [Gemini API terms](https://ai.google.dev/gemini-api/terms) and [Google Privacy Policy](https://policies.google.com/privacy). Do not upload pages containing information you are not permitted to send to Google.

The API key is stored using Obsidian's SecretStorage API. Original page images are saved in the vault only when scan callouts are enabled.

## Development and building

```bash
# Install dependencies
npm install

# Build production bundle
npm run build

# Watch mode for active development
npm run dev
```

## License
MIT
