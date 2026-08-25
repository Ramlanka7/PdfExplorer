# Reviewer Guide

This repository is a **Phase 1 POC architecture repo** for an Excel task-pane add-in that lets a
user browse folders and preview PDFs without leaving Excel.

The important point up front: **there is no committed vertical slice yet**. What exists today is
the design for the slice, the constraints it has to survive, and the standards that later phases
must meet.

## What Exists Today

- A numbered requirements set in [01-requirements.md](01-requirements.md)
- A ratified architecture and API shape in [02-architecture.md](02-architecture.md)
- A client-side design for the tree, store, and PDF viewer in [03-client.md](03-client.md)
- Excel-specific constraints and verification rules in [04-office.md](04-office.md)
- A testing strategy and delivery plan in [05-testing.md](05-testing.md) and [06-delivery.md](06-delivery.md)
- A decision log explaining the major technology choices in [decisions.md](decisions.md)

## What Does Not Exist Yet

- Application code under `src/`
- Automated tests under `tests/`
- A manifest under `manifest/`
- Screenshots, a GIF, or a sideloadable add-in package
- Phase 2 proof that the design actually works in a real Excel task pane

## What The POC Needs To Prove Next

Phase 2 matters because it is the first point where this stops being a plausible architecture and
starts being a working product slice.

That slice must prove all of these together:

1. Excel boots the task pane through `Office.onReady`.
2. The UI renders two panes in the real Excel host, not only in a browser tab.
3. Root items load first and folders expand one level at a time.
4. Clicking a PDF streams bytes through the API and renders it inside the pane with PDF.js.
5. The client remains storage-agnostic behind the provider seam.
6. Unsupported or legacy webviews fail legibly instead of showing a blank pane.

## Why The Constraints Matter

This project is stricter than a normal web app because Excel task panes break naive designs.

- The pane runs in a sandboxed iframe, not as a normal top-level page.
- HTTPS is required, including in development.
- The client cannot read `file://` paths, UNC shares, or local disks.
- Native PDF viewing is not reliable enough for the required controls, so PDF.js is deliberate.
- Cookie-based assumptions are weak in Excel on the web, so the design stays same-origin.

Those constraints are why the repo spends so much effort on same-origin hosting, server-mediated
PDF delivery, Office isolation, and the provider seam.

## Recommended Review Path

If you only have a few minutes, read these in order:

1. [../README.md](../README.md)
2. [02-architecture.md](02-architecture.md)
3. [04-office.md](04-office.md)
4. [06-delivery.md](06-delivery.md)

If you want the exact source of truth for scope and verification, read [01-requirements.md](01-requirements.md).

## Bottom Line

The current repo should be judged on whether the **design is credible and testable**, not on
whether the add-in already works. The implementation proof starts in Phase 2.