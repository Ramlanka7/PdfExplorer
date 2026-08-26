using Microsoft.AspNetCore.Mvc;
using Server.Infrastructure;
using Server.Models;
using Server.Providers;

namespace Server.Controllers;

[ApiController]
[Route("api/folders")]
public sealed class FoldersController(
  IFolderProvider provider,
  FolderSourceState sourceState,
  IFolderBrowseService browseService) : ControllerBase
{
  public sealed record FolderSourceRequest(string Path);
  public sealed record FolderSourceResponse(string Path);

  [HttpPut("source")]
  public IActionResult SetSource([FromBody] FolderSourceRequest? request)
  {
    if (request is null)
    {
      throw new InvalidSourceException();
    }

    SetValidatedSource(request.Path);
    return NoContent();
  }

  /// <summary>
  /// Shows the native Windows folder picker (FR-EXP-*: no typed path required). A cancel is a
  /// normal outcome, not an error - the current source, if any, is left exactly as it was.
  /// </summary>
  [HttpPost("source/browse")]
  public async Task<ActionResult<FolderSourceResponse>> BrowseSourceAsync(CancellationToken cancellationToken)
  {
    var selected = await browseService.BrowseForFolderAsync(cancellationToken);
    if (selected is null)
    {
      return NoContent();
    }

    var rootPath = SetValidatedSource(selected);
    return Ok(new FolderSourceResponse(rootPath));
  }

  private string SetValidatedSource(string path)
  {
    var rootPath = SelectableStorageProvider.NormalizeAndValidateRootPath(path);
    sourceState.SetRootPath(rootPath);
    return rootPath;
  }

  /// <summary>
  /// Clears the current source. There is nothing to validate: no source is always a valid state
  /// (the same one the app starts in), so this cannot fail the way SetSource can.
  /// </summary>
  [HttpDelete("source")]
  public IActionResult ClearSource()
  {
    sourceState.ClearRootPath();
    return NoContent();
  }

  [HttpGet("root")]
  public async Task<ActionResult<FolderPage>> GetRootAsync(
    [FromQuery] string? cursor,
    [FromQuery] int? limit,
    CancellationToken cancellationToken)
  {
    var page = await provider.GetRootItemsAsync(new ItemQuery(cursor, limit), cancellationToken);
    return Ok(page);
  }

  [HttpGet("{folderId}/children")]
  public async Task<ActionResult<FolderPage>> GetChildrenAsync(
    string folderId,
    [FromQuery] string? cursor,
    [FromQuery] int? limit,
    CancellationToken cancellationToken)
  {
    if (IdGuards.IsTraversalShaped(folderId))
    {
      throw new ItemNotFoundException("FOLDER_NOT_FOUND");
    }

    var page = await provider.GetChildrenAsync(folderId, new ItemQuery(cursor, limit), cancellationToken);
    return Ok(page);
  }
}
