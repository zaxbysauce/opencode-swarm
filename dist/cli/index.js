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
  fs.writeFileSync(filepath, `${JSON.stringify(data, null, 2)}
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
      agents: {
        architect: { model: "anthropic/claude-sonnet-4-20250514" },
        coder: { model: "anthropic/claude-sonnet-4-20250514" },
        sme: { model: "google/gemini-2.5-flash" },
        reviewer: { model: "google/gemini-2.5-flash" },
        test_engineer: { model: "google/gemini-2.5-flash" }
      },
      max_iterations: 5
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
\uD83D\uDCD6 SME agent:`);
  console.log("   The SME agent supports any domain \u2014 the Architect determines");
  console.log("   what expertise is needed and requests it dynamically.");
  return 0;
}
async function uninstall() {
  try {
    console.log(`\uD83D\uDC1D Uninstalling OpenCode Swarm...
`);
    const opencodeConfig = loadJson(OPENCODE_CONFIG_PATH);
    if (!opencodeConfig) {
      if (fs.existsSync(OPENCODE_CONFIG_PATH)) {
        console.log(`\u2717 Could not parse opencode config at: ${OPENCODE_CONFIG_PATH}`);
        return 1;
      } else {
        console.log(`\u26A0 No opencode config found at: ${OPENCODE_CONFIG_PATH}`);
        console.log("Nothing to uninstall.");
        return 0;
      }
    }
    if (!opencodeConfig.plugin || opencodeConfig.plugin.length === 0) {
      console.log("\u26A0 opencode-swarm is not installed (no plugins configured).");
      return 0;
    }
    const pluginName = "opencode-swarm";
    const filteredPlugins = opencodeConfig.plugin.filter((p) => p !== pluginName && !p.startsWith(`${pluginName}@`));
    if (filteredPlugins.length === opencodeConfig.plugin.length) {
      console.log("\u26A0 opencode-swarm is not installed.");
      return 0;
    }
    opencodeConfig.plugin = filteredPlugins;
    if (opencodeConfig.agent) {
      delete opencodeConfig.agent.explore;
      delete opencodeConfig.agent.general;
      if (Object.keys(opencodeConfig.agent).length === 0) {
        delete opencodeConfig.agent;
      }
    }
    saveJson(OPENCODE_CONFIG_PATH, opencodeConfig);
    console.log("\u2713 Removed opencode-swarm from OpenCode plugins");
    console.log("\u2713 Re-enabled default OpenCode agents (explore, general)");
    if (process.argv.includes("--clean")) {
      let cleaned = false;
      if (fs.existsSync(PLUGIN_CONFIG_PATH)) {
        fs.unlinkSync(PLUGIN_CONFIG_PATH);
        console.log(`\u2713 Removed plugin config: ${PLUGIN_CONFIG_PATH}`);
        cleaned = true;
      }
      if (fs.existsSync(PROMPTS_DIR)) {
        fs.rmSync(PROMPTS_DIR, { recursive: true });
        console.log(`\u2713 Removed custom prompts: ${PROMPTS_DIR}`);
        cleaned = true;
      }
      if (!cleaned) {
        console.log("\u2713 No config files to clean up");
      }
    }
    console.log(`
\u2705 Uninstall complete!`);
    return 0;
  } catch (error) {
    console.log("\u2717 Uninstall failed: " + (error instanceof Error ? error.message : String(error)));
    return 1;
  }
}
function printHelp() {
  console.log(`
opencode-swarm - Architect-centric agentic swarm plugin for OpenCode

Usage: bunx opencode-swarm [command] [OPTIONS]

Commands:
  install     Install and configure the plugin (default)
  uninstall   Remove the plugin from OpenCode config

Options:
  --clean     Also remove config files and custom prompts (with uninstall)
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
  bunx opencode-swarm uninstall
  bunx opencode-swarm uninstall --clean
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
  } else if (command === "uninstall") {
    const exitCode = await uninstall();
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
