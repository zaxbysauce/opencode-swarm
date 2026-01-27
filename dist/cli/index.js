#!/usr/bin/env bun
// @bun

// src/cli/index.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
var CONFIG_DIR = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");
var OPENCODE_CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
var PLUGIN_CONFIG_PATH = path.join(CONFIG_DIR, "opencode-swarm.json");
var PROMPTS_DIR = path.join(CONFIG_DIR, "opencode-swarm");
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
function loadJson(filepath) {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    const stripped = content.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (match, comment) => comment ? "" : match).replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}
function saveJson(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + `
`, "utf-8");
}
async function install() {
  console.log(`\uD83D\uDC1D Installing OpenCode Swarm...
`);
  ensureDir(CONFIG_DIR);
  ensureDir(PROMPTS_DIR);
  let opencodeConfig = loadJson(OPENCODE_CONFIG_PATH);
  if (!opencodeConfig) {
    opencodeConfig = {};
  }
  if (!opencodeConfig.plugin) {
    opencodeConfig.plugin = [];
  }
  const pluginName = "opencode-swarm";
  opencodeConfig.plugin = opencodeConfig.plugin.filter((p) => p !== pluginName && !p.startsWith(`${pluginName}@`));
  opencodeConfig.plugin.push(pluginName);
  if (!opencodeConfig.agent) {
    opencodeConfig.agent = {};
  }
  opencodeConfig.agent.explore = { disable: true };
  opencodeConfig.agent.general = { disable: true };
  saveJson(OPENCODE_CONFIG_PATH, opencodeConfig);
  console.log("\u2713 Added opencode-swarm to OpenCode plugins");
  console.log("\u2713 Disabled default OpenCode agents (explore, general)");
  if (!fs.existsSync(PLUGIN_CONFIG_PATH)) {
    const defaultConfig = {
      preset: "remote",
      presets: {
        remote: {
          architect: { model: "anthropic/claude-sonnet-4.5" },
          coder: { model: "openai/gpt-5.2-codex" },
          _sme: { model: "google/gemini-3-flash" },
          _qa: { model: "google/gemini-3-flash" },
          test_engineer: { model: "google/gemini-3-flash" }
        },
        hybrid: {
          architect: { model: "anthropic/claude-sonnet-4.5" },
          coder: { model: "ollama/qwen3:72b" },
          _sme: { model: "npu/qwen3:14b" },
          _qa: { model: "npu/qwen3:14b" },
          test_engineer: { model: "npu/qwen3:14b" }
        }
      },
      swarm_mode: "remote",
      max_iterations: 5,
      auto_detect_domains: true,
      inject_phase_reminders: true
    };
    saveJson(PLUGIN_CONFIG_PATH, defaultConfig);
    console.log("\u2713 Created default plugin config at:", PLUGIN_CONFIG_PATH);
  } else {
    console.log("\u2713 Plugin config already exists at:", PLUGIN_CONFIG_PATH);
  }
  console.log(`
\uD83D\uDCC1 Configuration files:`);
  console.log(`   OpenCode config: ${OPENCODE_CONFIG_PATH}`);
  console.log(`   Plugin config:   ${PLUGIN_CONFIG_PATH}`);
  console.log(`   Custom prompts:  ${PROMPTS_DIR}/`);
  console.log(`
\uD83D\uDE80 Installation complete!`);
  console.log(`
Next steps:`);
  console.log("1. Edit the plugin config to customize models and settings");
  console.log('2. Run "opencode" to start using the swarm');
  console.log("3. The Architect agent will orchestrate your requests");
  console.log(`
\uD83D\uDCD6 Available SME domains:`);
  console.log(`   windows, powershell, python, oracle, network, security,
` + "   linux, vmware, azure, active_directory, ui_ux");
  return 0;
}
function printHelp() {
  console.log(`
opencode-swarm - Architect-centric agentic swarm plugin for OpenCode

Usage: bunx opencode-swarm [command] [OPTIONS]

Commands:
  install     Install and configure the plugin (default)

Options:
  -h, --help  Show this help message

Configuration:
  Edit ~/.config/opencode/opencode-swarm.json to customize:
  - Model assignments per agent or category
  - Preset configurations (remote, hybrid)
  - Local inference endpoints (GPU/NPU URLs)
  - Max iterations and other settings

Custom Prompts:
  Place custom prompts in ~/.config/opencode/opencode-swarm/
  - {agent}.md       - Replace default prompt
  - {agent}_append.md - Append to default prompt

Examples:
  bunx opencode-swarm install
  bunx opencode-swarm --help
`);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }
  const command = args[0] || "install";
  if (command === "install") {
    const exitCode = await install();
    process.exit(exitCode);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error("Run with --help for usage information");
    process.exit(1);
  }
}
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
