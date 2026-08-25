using System.Windows.Forms;

namespace Server.Providers;

/// <summary>
/// FolderBrowserDialog is a Windows Forms control and can only run on an STA thread, which
/// Kestrel's request-handling threads are not. Each call spins up a dedicated STA thread to host
/// the dialog and hands the result back through a TaskCompletionSource.
/// </summary>
public sealed class WindowsFolderBrowseService : IFolderBrowseService
{
  public Task<string?> BrowseForFolderAsync(CancellationToken cancellationToken)
  {
    var completion = new TaskCompletionSource<string?>();

    var thread = new Thread(() =>
    {
      using var dialog = new FolderBrowserDialog
      {
        Description = "Select a folder to browse for PDFs",
        UseDescriptionForTitle = true,
      };
      var result = dialog.ShowDialog();
      completion.TrySetResult(result == DialogResult.OK ? dialog.SelectedPath : null);
    });

    thread.SetApartmentState(ApartmentState.STA);
    thread.IsBackground = true;
    thread.Start();

    return completion.Task;
  }
}
