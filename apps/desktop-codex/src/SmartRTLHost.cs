// GUI-subsystem host: never creates a user-facing console window.
// Launched in the app's package context; Node is started with CREATE_NO_WINDOW.
// While the helper runs, it also gives the app's windows their marked icon (WindowMark).
using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using Microsoft.Win32;

[StructLayout(LayoutKind.Sequential, Pack = 4)]
internal struct PropertyKey {
    public Guid Format; public uint Id;
    // System.AppUserModel: 2 RelaunchCommand, 3 RelaunchIconResource, 4 RelaunchDisplayNameResource, 5 ID
    public PropertyKey(uint id) { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); Id = id; }
}

[StructLayout(LayoutKind.Explicit)]
internal struct PropVariant { [FieldOffset(0)] public ushort Type; [FieldOffset(8)] public IntPtr Value; [FieldOffset(16)] public IntPtr Extra; }

[ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int GetAt(uint index, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
    [PreserveSig] int Commit();
}

// Gives the app's windows a taskbar button of their own, with the app's icon marked in its
// corner, from outside: the installed app is never changed, and an app opened without the
// helper keeps its plain icon on its own button. The icon follows the taskbar's light or dark
// theme, as the app's own does.
internal sealed class WindowMark {
    private delegate bool EnumProc(IntPtr window, IntPtr parameter);
    [DllImport("shell32.dll")] private static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IPropertyStore store);
    [DllImport("ole32.dll")] private static extern int PropVariantClear(ref PropVariant value);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumProc proc, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageTimeoutW(IntPtr window, uint message, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
    [DllImport("user32.dll")] private static extern int GetSystemMetricsForDpi(int index, uint dpi);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr LoadImageW(IntPtr instance, string name, uint type, int width, int height, uint load);
    [DllImport("kernel32.dll")] private static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern bool QueryFullProcessImageNameW(IntPtr process, int flags, StringBuilder name, ref int size);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);

    // A window's icons at the sizes Windows asks for at that window's scale (SM_CXICON and
    // SM_CXSMICON for its DPI), each taken from the ICO's image drawn for that size. The DPI is
    // the window's own: this host may run unaware of the display's scale, and the sizes for 96
    // dpi would show the icon smaller than the app's own on a scaled display.
    private sealed class Icon {
        public string Path; public IntPtr Big, Small;
    }

    private readonly string app, relaunch, name, light, dark, appId;
    private readonly Dictionary<string, Icon> loaded = new Dictionary<string, Icon>();
    public string Sizes;
    public string AppId { get { return appId; } }

    private WindowMark(string app, string light, string dark, string relaunch, string name) {
        this.app = app; this.light = light; this.dark = dark; this.relaunch = relaunch; this.name = name;
        // The taskbar keeps the icon it first saw for an app ID, and shows that one from then on.
        // An ID that carries the icons' fingerprint makes a changed icon a new app to it.
        using (var sha = System.Security.Cryptography.SHA256.Create()) {
            byte[] lightBytes = File.ReadAllBytes(light), darkBytes = File.ReadAllBytes(dark);
            sha.TransformBlock(lightBytes, 0, lightBytes.Length, null, 0);
            sha.TransformFinalBlock(darkBytes, 0, darkBytes.Length);
            appId = "SmartRTL.ChatGPT." + BitConverter.ToString(sha.Hash, 0, 4).Replace("-", "");
        }
    }

    // Null until the helper has written the icons, which it does before it starts the app.
    public static WindowMark Load(string app, string light, string dark, string relaunch, string name) {
        return File.Exists(light) && File.Exists(dark) ? new WindowMark(app, light, dark, relaunch, name) : null;
    }

    private Icon IconFor(IntPtr window) {
        uint dpi = GetDpiForWindow(window);
        if (dpi == 0) dpi = 96;
        string path = LightTaskbar() ? light : dark, key = path + "@" + dpi;
        Icon icon;
        if (loaded.TryGetValue(key, out icon)) return icon;
        int big = GetSystemMetricsForDpi(11, dpi), small = GetSystemMetricsForDpi(49, dpi);   // SM_CXICON, SM_CXSMICON
        icon = new Icon { Path = path,
            Big = LoadImageW(IntPtr.Zero, path, 1, big, big, 0x10),                        // LR_LOADFROMFILE
            Small = LoadImageW(IntPtr.Zero, path, 1, small, small, 0x10) };
        if (icon.Big == IntPtr.Zero || icon.Small == IntPtr.Zero) return null;
        if (Sizes == null) Sizes = big + "/" + small + " at " + dpi + " dpi";
        loaded[key] = icon;
        return icon;
    }

    private static bool LightTaskbar() {
        object value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "SystemUsesLightTheme", 1);
        return !(value is int) || (int)value != 0;
    }

    // Marks every visible top-level window of the app that does not carry the mark for the
    // current theme and its scale yet.
    public int Apply() {
        var pids = new HashSet<uint>();
        foreach (var process in Process.GetProcessesByName(Path.GetFileNameWithoutExtension(app))) {
            using (process) if (string.Equals(ImagePath(process.Id), app, StringComparison.OrdinalIgnoreCase)) pids.Add((uint)process.Id);
        }
        int marked = 0;
        if (pids.Count == 0) return marked;
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            uint pid; GetWindowThreadProcessId(window, out pid);
            if (pids.Contains(pid) && IsWindowVisible(window) && GetWindow(window, 4) == IntPtr.Zero) {   // GW_OWNER
                Icon icon = IconFor(window);
                if (icon != null && (ReadAppId(window) != appId || Message(window, 0x7F, (IntPtr)1, IntPtr.Zero) != icon.Big)) { Mark(window, icon); marked++; }   // WM_GETICON
            }
            return true;
        }, IntPtr.Zero);
        return marked;
    }

    private void Mark(IntPtr window, Icon icon) {
        IPropertyStore store; Guid iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(window, ref iid, out store) != 0) return;
        try {
            Set(store, 2, relaunch);
            Set(store, 3, icon.Path + ",0");
            Set(store, 4, name);
            Set(store, 5, appId);
            store.Commit();
        } finally { Marshal.ReleaseComObject(store); }
        Message(window, 0x80, (IntPtr)1, icon.Big);       // WM_SETICON, ICON_BIG
        Message(window, 0x80, IntPtr.Zero, icon.Small);   // ICON_SMALL
    }

    private static void Set(IPropertyStore store, uint id, string value) {
        var key = new PropertyKey(id);
        var variant = new PropVariant { Type = 31, Value = Marshal.StringToCoTaskMemUni(value) };   // VT_LPWSTR
        try { store.SetValue(ref key, ref variant); } finally { Marshal.FreeCoTaskMem(variant.Value); }
    }

    private static string ReadAppId(IntPtr window) {
        IPropertyStore store; Guid iid = typeof(IPropertyStore).GUID;
        if (SHGetPropertyStoreForWindow(window, ref iid, out store) != 0) return null;
        try {
            var key = new PropertyKey(5); PropVariant value;
            if (store.GetValue(ref key, out value) != 0) return null;
            try { return value.Type == 31 ? Marshal.PtrToStringUni(value.Value) : null; } finally { PropVariantClear(ref value); }
        } finally { Marshal.ReleaseComObject(store); }
    }

    // A window that does not answer within a second is skipped, never waited on.
    private static IntPtr Message(IntPtr window, uint message, IntPtr w, IntPtr l) {
        IntPtr result;
        return SendMessageTimeoutW(window, message, w, l, 0x2, 1000, out result) == IntPtr.Zero ? IntPtr.Zero : result;   // SMTO_ABORTIFHUNG
    }

    private static string ImagePath(int pid) {
        IntPtr process = OpenProcess(0x1000, false, pid);   // PROCESS_QUERY_LIMITED_INFORMATION
        if (process == IntPtr.Zero) return null;
        try {
            var path = new StringBuilder(1024); int size = path.Capacity;
            return QueryFullProcessImageNameW(process, 0, path, ref size) ? path.ToString() : null;
        } finally { CloseHandle(process); }
    }
}

internal static class SmartRTLHost {
    [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();

    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
    private static string Quote(string text) {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in text) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            result.Append(c); slashes = 0;
        }
        result.Append('\\', slashes * 2); return result.Append('"').ToString();
    }
    [STAThread] private static int Main(string[] args) {
        if (args.Length != 1) return 2;
        string reportPath = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[0])), "codex-rtl-host-report.json");
        var status = new Dictionary<string,object>();
        try {
            var request = Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(args[0]));
            string node = (string)request["nodeExecutable"], app = (string)request["appExecutable"];
            string script = (string)request["liveScript"], run = (string)request["runId"], family = (string)request["packageFamily"];
            string runtime = Path.GetDirectoryName(Path.GetFullPath(args[0]));
            object lightIcon, darkIcon, relaunch, displayName;
            request.TryGetValue("markedIconLight", out lightIcon); request.TryGetValue("markedIconDark", out darkIcon);
            request.TryGetValue("relaunchCommand", out relaunch); request.TryGetValue("displayName", out displayName);
            if (!Path.IsPathRooted(node) || !Path.IsPathRooted(app) || !Path.IsPathRooted(script) || !File.Exists(node) || !File.Exists(app) || !File.Exists(script)) throw new IOException("A required installed executable or helper script is missing.");
            status["runId"] = run; status["hostPid"] = Process.GetCurrentProcess().Id;
            status["hostHasConsole"] = GetConsoleWindow() != IntPtr.Zero;
            status["nodeCreateNoWindow"] = true; status["state"] = "starting";
            status["at"] = DateTime.UtcNow.ToString("o");
            File.WriteAllText(reportPath, Json.Serialize(status));
            var start = new ProcessStartInfo(node, Quote(script) + " " + Quote(app) + " " + Quote(run) + " " + Quote(family) + " " + Quote("task-scheduler-gui-host") + " " + Quote(runtime));
            start.UseShellExecute = false; start.CreateNoWindow = true; start.WindowStyle = ProcessWindowStyle.Hidden;
            start.WorkingDirectory = Path.GetDirectoryName(script);
            start.RedirectStandardOutput = true; start.RedirectStandardError = true;
            using (var process = new Process()) {
                process.StartInfo = start;
                // Drain output so a full pipe cannot block the background helper.
                process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { };
                process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { };
                process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
                status["helperPid"] = process.Id; status["state"] = "running";
                status["at"] = DateTime.UtcNow.ToString("o"); File.WriteAllText(reportPath, Json.Serialize(status));
                WindowMark mark = null;
                while (!process.WaitForExit(1000)) {
                    if (lightIcon == null || darkIcon == null) continue;
                    try {
                        if (mark == null) mark = WindowMark.Load(app, (string)lightIcon, (string)darkIcon, (string)relaunch, (string)displayName);
                        if (mark != null && mark.Apply() > 0 && !status.ContainsKey("windowsMarkedAt")) {
                            status["windowsMarkedAt"] = DateTime.UtcNow.ToString("o"); status["iconSizes"] = mark.Sizes; status["appId"] = mark.AppId;
                            File.WriteAllText(reportPath, Json.Serialize(status));
                        }
                    } catch (Exception e) {
                        if (!status.ContainsKey("markError")) { status["markError"] = e.Message; File.WriteAllText(reportPath, Json.Serialize(status)); }
                    }
                }
                process.WaitForExit(); status["state"] = "helper-ended"; status["exitCode"] = process.ExitCode;
                status["at"] = DateTime.UtcNow.ToString("o"); File.WriteAllText(reportPath, Json.Serialize(status));
                return process.ExitCode;
            }
        } catch (Exception e) {
            status["state"] = "error"; status["error"] = e.Message; status["at"] = DateTime.UtcNow.ToString("o");
            try { File.WriteAllText(reportPath, Json.Serialize(status)); } catch { }
            return 1;
        }
    }
}
