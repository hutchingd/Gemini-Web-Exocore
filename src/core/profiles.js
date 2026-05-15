import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  AUTH_FILE, CONFIG_DIR_NAME, CONFIG_FILE, DEFAULT_PROFILE_NAME,
  ENV_PROFILE, NLM_CONFIG_DIR_NAME, PROFILES_DIR,
} from './constants.js';
import { ProfileError } from './exceptions.js';
import { logger } from "@exocore/multi";

function configDir() { return path.join(os.homedir(), CONFIG_DIR_NAME); }
function nlmConfigDir() { return path.join(os.homedir(), NLM_CONFIG_DIR_NAME); }

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

export class ProfileManager {
  constructor({ configDir: cd, nlmConfigDir: ncd } = {}) {
    this.configDir    = cd  ?? configDir();
    this.profilesDir  = path.join(this.configDir, PROFILES_DIR);
    this.configFile   = path.join(this.configDir, CONFIG_FILE);
    this.nlmConfigDir = ncd ?? nlmConfigDir();
    this.nlmProfilesDir = path.join(this.nlmConfigDir, PROFILES_DIR);
  }

  #ensureDirs() {
    fs.mkdirSync(this.configDir, { recursive: true });
    fs.mkdirSync(this.profilesDir, { recursive: true });
  }

  #profileDir(name) { return path.join(this.profilesDir, name); }
  #authFilePath(name) { return path.join(this.#profileDir(name), AUTH_FILE); }
  #nlmProfileDir(name) { return path.join(this.nlmProfilesDir, name); }

  #readConfig() {
    if (fs.existsSync(this.configFile)) {
      try { return JSON.parse(fs.readFileSync(this.configFile, 'utf-8')); } catch { return {}; }
    }
    return {};
  }

  #writeConfig(config) {
    this.#ensureDirs();
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
  }

  getActiveProfile() {
    const env = process.env[ENV_PROFILE];
    if (env) return env;
    const cfg = this.#readConfig();
    return cfg.active_profile ?? DEFAULT_PROFILE_NAME;
  }

  setActiveProfile(name) {
    if (!this.profileExists(name)) throw new ProfileError(`Profile '${name}' does not exist.`);
    const cfg = this.#readConfig();
    cfg.active_profile = name;
    cfg.version = 1;
    this.#writeConfig(cfg);
    logger.info(`Switched to profile: ${name}`);
  }

  profileExists(name) {
    return isDir(this.#profileDir(name)) || isDir(this.#nlmProfileDir(name));
  }

  #listGemcliProfiles() {
    if (!fs.existsSync(this.profilesDir)) return [];
    return fs.readdirSync(this.profilesDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name).sort();
  }

  #listNlmProfiles() {
    if (!fs.existsSync(this.nlmProfilesDir)) return [];
    return fs.readdirSync(this.nlmProfilesDir, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => d.name).sort();
  }

  listProfiles() {
    return Array.from(new Set([...this.#listGemcliProfiles(), ...this.#listNlmProfiles()])).sort();
  }

  listProfilesDetailed() {
    const profiles = new Map();
    for (const name of this.#listNlmProfiles()) {
      profiles.set(name, { name, source: 'nlm', path: this.#nlmProfileDir(name), displayName: `${name} (from NotebookLM)` });
    }
    for (const name of this.#listGemcliProfiles()) {
      profiles.set(name, { name, source: 'gemcli', path: this.#profileDir(name), displayName: name });
    }
    return Array.from(profiles.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  getProfileSource(name) {
    if (isDir(this.#profileDir(name))) return 'gemcli';
    if (isDir(this.#nlmProfileDir(name))) return 'nlm';
    throw new ProfileError(`Profile '${name}' does not exist.`);
  }

  createProfile(name) {
    this.#ensureDirs();
    const dir = this.#profileDir(name);
    if (fs.existsSync(dir)) throw new ProfileError(`Profile '${name}' already exists.`);
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`Created profile: ${name}`);
    return dir;
  }

  deleteProfile(name) {
    const dir = this.#profileDir(name);
    if (!fs.existsSync(dir)) {
      if (isDir(this.#nlmProfileDir(name)))
        throw new ProfileError(`Profile '${name}' is from NotebookLM MCP. Delete it from NotebookLM instead.`);
      throw new ProfileError(`Profile '${name}' does not exist.`);
    }
    if (this.getActiveProfile() === name)
      throw new ProfileError(`Cannot delete the active profile '${name}'. Switch to another profile first.`);
    fs.rmSync(dir, { recursive: true, force: true });
    logger.info(`Deleted profile: ${name}`);
  }

  renameProfile(oldName, newName) {
    const oldDir = this.#profileDir(oldName);
    if (!fs.existsSync(oldDir)) {
      if (isDir(this.#nlmProfileDir(oldName)))
        throw new ProfileError(`Profile '${oldName}' is from NotebookLM MCP. Rename it from NotebookLM instead.`);
      throw new ProfileError(`Profile '${oldName}' does not exist.`);
    }
    const trimmed = newName.trim();
    if (!trimmed) throw new ProfileError('New profile name cannot be empty.');
    if (this.profileExists(trimmed)) throw new ProfileError(`Profile '${trimmed}' already exists.`);

    const newDir = this.#profileDir(trimmed);
    fs.renameSync(oldDir, newDir);
    logger.debug(`Renamed profile dir: ${oldName} -> ${trimmed}`);

    const chromeProfilesDir = path.join(this.configDir, 'chrome-profiles');
    const oldChrome = path.join(chromeProfilesDir, oldName);
    const newChrome = path.join(chromeProfilesDir, trimmed);
    if (fs.existsSync(oldChrome)) { fs.renameSync(oldChrome, newChrome); logger.debug(`Renamed Chrome profile: ${oldName} -> ${trimmed}`); }

    const oldTf = path.join(chromeProfilesDir, `${oldName}_tf`);
    const newTf = path.join(chromeProfilesDir, `${trimmed}_tf`);
    if (fs.existsSync(oldTf)) { fs.renameSync(oldTf, newTf); logger.debug(`Renamed TF profile: ${oldName}_tf -> ${trimmed}_tf`); }

    const authFile = this.#authFilePath(trimmed);
    if (fs.existsSync(authFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
        const oldPath = data.chrome_profile_path ?? '';
        if (oldPath && oldPath.includes(oldName)) {
          data.chrome_profile_path = oldPath.replace(`/${oldName}`, `/${trimmed}`);
          fs.writeFileSync(authFile, JSON.stringify(data, null, 2));
          logger.debug('Updated chrome_profile_path in auth.json');
        }
      } catch (e) { logger.warn(`Could not update auth.json: ${e.message}`); }
    }

    if (this.getActiveProfile() === oldName) {
      const cfg = this.#readConfig();
      cfg.active_profile = trimmed;
      this.#writeConfig(cfg);
      logger.debug(`Updated active profile: ${oldName} -> ${trimmed}`);
    }

    logger.info(`Renamed profile: ${oldName} -> ${trimmed}`);
  }

  loadAuth(name) {
    const profileName = name ?? this.getActiveProfile();
    const gemcliAuth = this.#authFilePath(profileName);
    if (fs.existsSync(gemcliAuth)) {
      try { return JSON.parse(fs.readFileSync(gemcliAuth, 'utf-8')); }
      catch (e) { logger.warn(`Failed to load gemcli auth for '${profileName}': ${e.message}`); }
    }
    const nlmChromeDir = path.join(this.nlmConfigDir, 'chrome-profiles', profileName);
    if (isDir(nlmChromeDir)) {
      logger.debug(`Using NLM Chrome profile for '${profileName}': ${nlmChromeDir}`);
      return { chrome_profile_path: nlmChromeDir, _source: 'nlm', _nlm_profile: profileName };
    }
    return {};
  }

  saveAuth(authData, name) {
    const profileName = name ?? this.getActiveProfile();
    this.#ensureDirs();
    const dir = this.#profileDir(profileName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.#authFilePath(profileName), JSON.stringify(authData, null, 2));
    logger.debug(`Saved auth for profile: ${profileName}`);
  }

  getChromeProfilePath(name) {
    const profileName = name ?? this.getActiveProfile();
    const gemcliAuth = this.#authFilePath(profileName);
    if (fs.existsSync(gemcliAuth)) {
      try {
        const data = JSON.parse(fs.readFileSync(gemcliAuth, 'utf-8'));
        if (data.chrome_profile_path) return data.chrome_profile_path;
      } catch { /* ignore */ }
    }
    const nlmChrome = path.join(this.nlmConfigDir, 'chrome-profiles', profileName);
    if (isDir(nlmChrome)) return nlmChrome;
    return null;
  }

  hasNlmProfiles() { return this.#listNlmProfiles().length > 0; }
  isFirstRun() { return this.#listGemcliProfiles().length === 0; }
}
