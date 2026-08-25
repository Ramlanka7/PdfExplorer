using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace Server.Providers;

/// <summary>
/// FolderBrowserDialog is a Windows Forms control and can only run on an STA thread, which
/// Kestrel's request-handling threads are not. Each call spins up a dedicated STA thread to host
/// the dialog and hands the result back through a TaskCompletionSource.
///
/// The server is a headless process with no window of its own, so the dialog has no owner to
/// anchor its z-order to. Windows' foreground-lock then refuses to let it steal focus from
/// whichever app (the browser) triggered the request - the dialog opens successfully but stays
/// behind that window, invisible, until it is explicitly forced to the foreground.
/// </summary>
public sealed class WindowsFolderBrowseService : IFolderBrowseService
{
  public Task<string?> BrowseForFolderAsync(CancellationToken cancellationToken)
  {
    var completion = new TaskCompletionSource<string?>();

    var thread = new Thread(() =>
    {
      using var owner = new Form
      {
        ShowInTaskbar = false,
        FormBorderStyle = FormBorderStyle.None,
        StartPosition = FormStartPosition.Manual,
        Location = new Point(-2000, -2000),
        Size = new Size(1, 1),
      };
      owner.Show();
      ForceForeground(owner.Handle);

      using var dialog = new FolderBrowserDialog
      {
        Description = "Select a folder to browse for PDFs",
        UseDescriptionForTitle = true,
      };
      var result = dialog.ShowDialog(owner);
      completion.TrySetResult(result == DialogResult.OK ? dialog.SelectedPath : null);
    });

    thread.SetApartmentState(ApartmentState.STA);
    thread.IsBackground = true;
    thread.Start();

    return completion.Task;
  }

  /// <summary>
  /// SetForegroundWindow alone is refused by Windows for a process that isn't already the
  /// foreground one, which this headless server never is. Briefly attaching this thread's input
  /// queue to the current foreground thread's is the standard, documented way around that lock.
  /// </summary>
  private static void ForceForeground(IntPtr handle)
  {
    var foregroundWindow = NativeMethods.GetForegroundWindow();
    var foregroundThreadId = NativeMethods.GetWindowThreadProcessId(foregroundWindow, out _);
    var currentThreadId = NativeMethods.GetCurrentThreadId();

    var attached = foregroundThreadId != currentThreadId &&
      NativeMethods.AttachThreadInput(currentThreadId, foregroundThreadId, true);
    try
    {
      NativeMethods.SetForegroundWindow(handle);
    }
    finally
    {
      if (attached)
      {
        NativeMethods.AttachThreadInput(currentThreadId, foregroundThreadId, false);
      }
    }
  }

  private static class NativeMethods
  {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
  }
}
