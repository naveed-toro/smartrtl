const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const sourceRoot = path.resolve(__dirname, '../src');
const source = fs.readFileSync(path.join(sourceRoot, 'hook.js'), 'utf8');
const copy = path.join('copies', '6.6395.0.0');
const relaunch = 'powershell.exe -File "launch.ps1"';

function load({ withIcon }) {
  const app = new EventEmitter(), autoUpdater = new EventEmitter();
  app.getName = () => 'Claude'; app.getVersion = () => '6.6395.0'; app.getPath = () => 'profile';
  app.whenReady = () => Promise.resolve();
  class Tray { setToolTip(text) { this.toolTip = text; } }
  const icon = { isEmpty: () => !withIcon };
  const nativeImage = { createFromPath: (p) => (p === path.join(copy, 'smartrtl-icon.png') ? icon : null) };
  const fakeFs = {
    readFileSync: (p) => (p === path.join(copy, 'smartrtl-patched.json')
      ? JSON.stringify({ patchRevision: 3, relaunch }) : 'window.payload=1;'),
    mkdirSync() {}, writeFileSync() {},
  };
  vm.runInNewContext(source, {
    __dirname: sourceRoot, URL, setTimeout, setInterval, clearInterval,
    process: { env: { SMARTRTL_STATUS_DIRECTORY: 'status' }, execPath: path.join(copy, 'claude.exe') },
    require: (name) => name === 'electron' ? { app, autoUpdater, Tray, nativeImage }
      : name === 'fs' ? fakeFs : require(name),
  });
  return { app, Tray, icon };
}

function window(title) {
  const win = new EventEmitter();
  win.title = title;
  win.getTitle = () => win.title;
  win.setTitle = (t) => { win.title = t; };
  win.setAppDetails = (details) => { win.details = details; };
  win.setIcon = (image) => { win.icon = image; };
  return win;
}

test('every window title says it is the copy, once, including titles Claude sets later', () => {
  const { app } = load({ withIcon: true });
  const win = window('Claude');
  app.emit('browser-window-created', {}, win);
  app.emit('browser-window-created', {}, win);   // Claude announces its first window again
  assert.equal(win.title, 'Claude (SmartRTL)');
  win.setTitle('About Claude');
  assert.equal(win.title, 'About Claude (SmartRTL)');
  win.setTitle('');
  assert.equal(win.title, 'Claude (SmartRTL)');
});

test('the windows get a taskbar button of their own, with the marked icon, pinned through the launcher', () => {
  const { app, icon } = load({ withIcon: true });
  const win = window('Claude');
  app.emit('browser-window-created', {}, win);
  assert.equal(win.icon, icon);
  assert.deepEqual({ ...win.details }, {
    appId: 'SmartRTL.Claude',
    appIconPath: path.join(copy, 'smartrtl-icon.ico'),
    relaunchCommand: relaunch,
    relaunchDisplayName: 'Claude (SmartRTL)',
  });
});

test("without the marked icon the windows stay on Claude's button, still named", () => {
  const { app } = load({ withIcon: false });
  const win = window('Claude');
  app.emit('browser-window-created', {}, win);
  assert.equal(win.details, undefined);
  assert.equal(win.icon, undefined);
  assert.equal(win.title, 'Claude (SmartRTL)');
});

test("only Claude's own tray tooltip is marked", () => {
  const { Tray } = load({ withIcon: true });
  const own = new Tray(), other = new Tray();
  own.setToolTip('Claude');
  other.setToolTip('Some extension');
  assert.equal(own.toolTip, 'Claude (SmartRTL)');
  assert.equal(other.toolTip, 'Some extension');
});
