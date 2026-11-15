// GUI-subsystem host: never creates a user-facing console window.
// Launched in the app's package context; Node is started with CREATE_NO_WINDOW.
using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;

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
