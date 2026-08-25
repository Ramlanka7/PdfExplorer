using Microsoft.AspNetCore.Mvc;
using Server.Infrastructure;
using Server.Models;
using Server.Providers;

namespace Server.Controllers;

[ApiController]
[Route("api/folders")]
public sealed class FoldersController(IFolderProvider provider) : ControllerBase
{
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
