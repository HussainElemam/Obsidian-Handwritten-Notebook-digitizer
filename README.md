# Handwritten Notebook Digitizer for Obsidian

An Obsidian plugin that digitizes physical notebook pages in any language into structured Markdown notes using Google's Gemini Vision API.

---

## Features

- **Multimodal Handwriting Recognition**: Uses Google Gemini models (featuring the latest **Gemini 3.8 Flash**, **Gemini 3.1 Pro**, and **Gemini 3.5 Flash-Lite**, along with 2.5/2.0/1.5 versions and custom models) to accurately transcribe messy handwriting by reasoning through grammar and sentence context.
- **Multilingual Handwriting & Mixed Content**: Seamlessly transcribes handwriting in any language or script, including mixed bilingual text, technical terminology, programming code, LaTeX mathematical formulas (`$E=mc^2$`), tables, and nested bullet points.
- **Handwritten Diagrams to Mermaid**: Automatically detects handwritten flowcharts, workflows, hierarchies, sequence charts, and process diagrams and converts them into native Obsidian Mermaid diagrams (````mermaid ... ````).
- **Continuous Seamless Notes**: When multiple pages are selected, they are combined into one natural, continuous Markdown note without artificial page break dividers (or optionally separated with page dividers via an in-modal toggle).
- **Automatic Image Optimization**: Automatically optimizes photos (up to 1920px max dimension, quality-tuned JPEG) before uploading and saving. This drastically reduces payload size (from 5–8MB down to ~300–600KB) and prevents gateway timeouts, with zero loss in handwriting recognition quality with Gemini 3.8 Flash.
- **Dedicated Scans Subfolder**: Page images are stored inside a dedicated `scans/` subfolder under the note's directory by default, keeping your notes clean.
- **Collapsible Scans for Proofreading**: Optionally embeds original page scans into collapsible callouts (`> [!info]- Original Scan (Page X)`) at the top of the group or per page, allowing effortless side-by-side verification.
- **Personal Gemini API Key**: Users provide and store their own free Google Gemini API key locally in their vault. Keys can be entered or changed directly inside the capture modal or in Settings.
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

### Manual Installation to your Obsidian Vault

1. Inside your Obsidian vault folder, navigate to:
   ```
   <Vault>/.obsidian/plugins/
   ```
2. Create a new folder named `notebook-digitizer`:
   ```
   <Vault>/.obsidian/plugins/notebook-digitizer/
   ```
3. Copy the following files from this repository into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. In Obsidian, go to **Settings** > **Community plugins**, click the refresh icon, and toggle on **Handwritten Notebook Digitizer**.

---

## Configuration

1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. In Obsidian, go to **Settings** > **Handwritten Notebook Digitizer**:
   - **Gemini API Key**: Paste your API key.
   - **Gemini Model**: Select from `Gemini 3.8 Flash` (default, fast & recommended), `Gemini 3.1 Pro` (most capable for complex handwriting), `Gemini 3.5 Flash-Lite`, earlier versions, or `Custom Model`.
   - **Scans Subfolder**: Default is `scans`. Uploaded page images are stored in a dedicated subfolder under the note's directory to keep your notes clean.
   - **Callout Title**: Default is `Original Scan` (or customize to your preferred title or language).

---

## Usage

### 1. Digitize a Group of Pages (New Note)
1. Click the **Camera ribbon icon** on the left ribbon, or press `Ctrl+P` / `Cmd+P` and choose:
   `Digitize Handwritten Notes`
2. Click **📁 Choose Images** (or drag and drop images), or **📷 Capture with Camera** on mobile.
3. (Optional) Enter custom instructions for this batch.
4. (Optional) In the Options section:
   - Toggle **Add callout with original scan** (enabled by default; uncheck if you only want transcribed text without embedding or saving scans).
   - Toggle **Separate pages with page breaks** if you want explicit page dividers (`---`) instead of one continuous note.
5. Keep **Create New Note** selected (or choose Append), enter a title, and click **Digitize & Transcribe**.

### 2. Append Pages to an Existing Note
1. Open the note you want to add pages to.
2. Open the command palette and run:
   `Append Handwritten Notes to Active File`
   *(or open the modal and select "Append to Active Note")*
3. Select or capture the new pages.
4. Click **Digitize & Transcribe**. The new pages and their collapsible scan callouts will be cleanly appended to the end of your note with a section divider.

---

## Development & Building

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

