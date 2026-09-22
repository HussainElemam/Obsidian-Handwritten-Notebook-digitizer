import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores([
		"main.js",
		"test/**",
		"esbuild.config.mjs",
	]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.*"],
				},
			},
		},
		rules: {
			"obsidianmd/ui/sentence-case": [
				"warn",
				{
					brands: ["Google AI Studio", "Gemini", "LaTeX", "Markdown", "Obsidian", "SecretStorage", "WebP"],
					acronyms: ["AI", "API", "ID", "JPG", "PNG"],
				},
			],
		},
	},
	{
		files: ["src/settings.ts"],
		rules: {
			// Imperative settings remain necessary for the minimum supported Obsidian 1.11.4.
			"@typescript-eslint/no-deprecated": "off",
			"obsidianmd/settings-tab/prefer-setting-definitions": "off",
		},
	},
]);
