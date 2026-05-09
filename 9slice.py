#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import struct
from pathlib import Path


REQUIRED_SLICES = [
    "tl.png",
    "top.png",
    "tr.png",
    "left.png",
    "middle.png",
    "right.png",
    "bl.png",
    "bot.png",
    "br.png",
]

OPTIONAL_ASSETS = [
    "corner-tl.png",
    "close-button.png",
    "close-button-over.png",
    "close-button-down.png",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate CSS/HTML/JS demo files for a 9-slice export folder."
    )
    parser.add_argument(
        "folder",
        help="Folder name like DialogBox1 or a path like ./output/DialogBox1",
    )
    return parser.parse_args()


def resolve_folder(folder_arg: str) -> Path:
    candidate = Path(folder_arg)
    if candidate.is_dir():
        return candidate.resolve()

    named_output = Path(__file__).resolve().parent / "output" / folder_arg
    if named_output.is_dir():
        return named_output.resolve()

    raise SystemExit(f"Folder not found: {folder_arg}")


def read_png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)

    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"Not a valid PNG: {path}")

    width, height = struct.unpack(">II", header[16:24])
    return width, height


def collect_dimensions(folder: Path) -> dict[str, tuple[int, int]]:
    missing = [name for name in REQUIRED_SLICES if not (folder / name).is_file()]
    if missing:
        raise SystemExit(
            "Missing required 9-slice files in "
            f"{folder}: {', '.join(missing)}"
        )

    dims: dict[str, tuple[int, int]] = {}
    for name in REQUIRED_SLICES + OPTIONAL_ASSETS:
        path = folder / name
        if path.is_file():
            dims[name] = read_png_size(path)
    return dims


def load_manifest(folder: Path) -> dict | None:
    manifest_path = folder / f"{folder.name}.json"
    if not manifest_path.is_file():
        return None

    with manifest_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def section_map(manifest: dict | None) -> dict[str, dict]:
    if not manifest:
        return {}
    return {section["name"]: section for section in manifest.get("sections", [])}


def absolute_box_css(
    section_name: str,
    section_lookup: dict[str, dict],
    offsets: dict[str, float],
) -> dict[str, str]:
    section = section_lookup.get(section_name)
    if not section:
        raise SystemExit(f"Manifest references unknown section: {section_name}")

    col = section_name
    row = section_name
    width = section["width"] - offsets["left"] - offsets["right"]
    height = section["height"] - offsets["top"] - offsets["bottom"]

    if col in ("tl", "left", "bl"):
        left = f"{offsets['left']}px"
        width_css = f"{width}px"
    elif col in ("top", "middle", "bot"):
        left = f"calc(var(--slice-left) + {offsets['left']}px)"
        width_css = (
            "calc(100% - var(--slice-left) - var(--slice-right) - "
            f"{offsets['left'] + offsets['right']}px)"
        )
    else:
        left = f"calc(100% - var(--slice-right) + {offsets['left']}px)"
        width_css = f"{width}px"

    if row in ("tl", "top", "tr"):
        top = f"{offsets['top']}px"
        height_css = f"{height}px"
    elif row in ("left", "middle", "right"):
        top = f"calc(var(--slice-top) + {offsets['top']}px)"
        height_css = (
            "calc(100% - var(--slice-top) - var(--slice-bottom) - "
            f"{offsets['top'] + offsets['bottom']}px)"
        )
    else:
        top = f"calc(100% - var(--slice-bottom) + {offsets['top']}px)"
        height_css = f"{height}px"

    return {
        "left": left,
        "top": top,
        "width": width_css,
        "height": height_css,
    }


def close_button_css(
    manifest: dict | None,
    section_lookup: dict[str, dict],
) -> tuple[str, str]:
    if not manifest or "close_button" not in manifest:
        return "top: 16px;\n    right: 18px;", "width: 36px;\n    height: 36px;"

    close_button = manifest["close_button"]
    section_name = close_button["section"]
    section = section_lookup.get(section_name)
    if not section:
        return "top: 16px;\n    right: 18px;", "36px"

    offset = close_button["offset_from_top_right"]
    width = offset["width"]
    height = offset["height"]
    right_inset = offset["x"] - width
    top_inset = offset["y"]

    if section_name in ("tl", "top", "tr"):
        top_css = f"{top_inset}px"
    elif section_name in ("left", "middle", "right"):
        top_css = f"calc(var(--slice-top) + {top_inset}px)"
    else:
        top_css = f"calc(100% - var(--slice-bottom) + {top_inset}px)"

    if section_name in ("tr", "right", "br"):
        right_css = f"{right_inset}px"
    elif section_name in ("top", "middle", "bot"):
        right_css = f"calc(var(--slice-right) + {right_inset}px)"
    else:
        right_css = f"calc(100% - var(--slice-left) + {right_inset}px)"

    return (
        f"top: {top_css};\n    right: {right_css};",
        f"width: {width}px;\n    height: {height}px;",
    )


def title_area_css(
    manifest: dict | None,
    section_lookup: dict[str, dict],
) -> tuple[str, str, str]:
    if not manifest or "title_area" not in manifest:
        return (
            "display: none;",
            "#f7e8cd",
            "padding: 0 56px;"
        )

    title_area = manifest["title_area"]
    box = absolute_box_css(title_area["section"], section_lookup, title_area["offsets"])
    color = title_area.get("title_color", {}).get("hex", "#f7e8cd")
    title_rules = (
        f"left: {box['left']};\n"
        f"    top: {box['top']};\n"
        f"    width: {box['width']};\n"
        f"    height: {box['height']};"
    )
    body_padding = f"padding: 14px 22px 18px;"
    return title_rules, color, body_padding


def css_text(
    base_name: str,
    dims: dict[str, tuple[int, int]],
    manifest: dict | None,
) -> str:
    left_width, top_height = dims["tl.png"]
    right_width, _ = dims["tr.png"]
    _, bottom_height = dims["bl.png"]
    close_dims = dims.get("close-button.png", (32, 32))
    has_close = "close-button.png" in dims
    has_corner = "corner-tl.png" in dims
    corner_dims = dims.get("corner-tl.png", (0, 0))
    sections = section_map(manifest)
    title_position_css, title_color, body_padding = title_area_css(manifest, sections)
    close_position_css, close_size_css = close_button_css(manifest, sections)

    close_css = ""
    close_markup_note = "available" if has_close else "not exported"
    if has_close:
        close_css = f"""
.dialog-close {{
    {close_size_css}
    background-image: url("close-button.png");
}}

.dialog-close:hover {{
    background-image: url("close-button-over.png");
}}

.dialog-close:active {{
    background-image: url("close-button-down.png");
    transform: translateY(1px);
}}
"""
    else:
        close_css = """
.dialog-close {
    width: 36px;
    height: 36px;
    background: #6d4c33;
    color: #f7e8cd;
    border: 2px solid #382317;
    border-radius: 10px;
}
"""

    corner_css = ""
    if has_corner:
        corner_css = f"""

.dialog-corner {{
    position: absolute;
    width: {corner_dims[0]}px;
    height: {corner_dims[1]}px;
    background: url("corner-tl.png") no-repeat center / 100% 100%;
    pointer-events: none;
    z-index: 3;
}}

.dialog-corner-tl {{
    top: 0;
    left: 0;
}}

.dialog-corner-tr {{
    top: 0;
    right: 0;
    transform: scaleX(-1);
    transform-origin: center;
}}

.dialog-corner-bl {{
    bottom: 0;
    left: 0;
    transform: scaleY(-1);
    transform-origin: center;
}}

.dialog-corner-br {{
    right: 0;
    bottom: 0;
    transform: scale(-1, -1);
    transform-origin: center;
}}
"""

    return f"""/* {base_name}.css
   Generated by 9slice.py.
   Close button asset: {close_markup_note}. */

:root {{
    --dialog-default-width: 800px;
    --dialog-default-height: 600px;
    --dialog-large-width: 960px;
    --dialog-large-height: 680px;
    --dialog-xlarge-width: 1120px;
    --dialog-xlarge-height: 760px;
    --slice-left: {left_width}px;
    --slice-right: {right_width}px;
    --slice-top: {top_height}px;
    --slice-bottom: {bottom_height}px;
    --page-bg-a: #1a2433;
    --page-bg-b: #30455d;
    --ink-soft: #f5ead8;
    --ink-main: #2c170d;
    --wood-dark: #52311f;
    --shadow-deep: rgba(10, 10, 16, 0.44);
}}

/* Demo page shell */
* {{
    box-sizing: border-box;
}}

html,
body {{
    margin: 0;
    min-height: 100%;
    font-family: Georgia, "Times New Roman", serif;
    color: var(--ink-soft);
    background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 30%),
        linear-gradient(180deg, var(--page-bg-b), var(--page-bg-a));
}}

body {{
    min-height: 100vh;
}}

.demo-stage {{
    min-height: 100vh;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}}

.demo-toolbar {{
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
}}

.demo-toolbar button {{
    padding: 10px 16px;
    font: inherit;
    color: var(--ink-soft);
    background: linear-gradient(180deg, #7a563a, #51331f);
    border: 1px solid rgba(255, 241, 216, 0.35);
    border-radius: 999px;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24);
    cursor: pointer;
}}

.demo-toolbar button:hover {{
    filter: brightness(1.08);
}}

.demo-note {{
    max-width: 70ch;
    margin: 0;
    line-height: 1.5;
    color: rgba(245, 234, 216, 0.82);
}}

/* Modal stage */
.dialog-host {{
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(6, 10, 18, 0.38);
    backdrop-filter: blur(6px);
}}

/* 9-slice frame */
.dialog-window {{
    position: relative;
    display: grid;
    grid-template-columns: var(--slice-left) minmax(0, 1fr) var(--slice-right);
    grid-template-rows: var(--slice-top) minmax(0, 1fr) var(--slice-bottom);
    width: min(calc(100vw - 40px), var(--dialog-width, var(--dialog-default-width)));
    height: min(calc(100vh - 40px), var(--dialog-height, var(--dialog-default-height)));
    filter: drop-shadow(0 24px 40px var(--shadow-deep));
}}
{corner_css}

.dialog-window.size-small {{
    --dialog-width: 420px;
    --dialog-height: 240px;
}}

.dialog-window.size-medium {{
    --dialog-width: var(--dialog-default-width);
    --dialog-height: var(--dialog-default-height);
}}

.dialog-window.size-large {{
    --dialog-width: var(--dialog-large-width);
    --dialog-height: var(--dialog-large-height);
}}

.dialog-window.size-xlarge {{
    --dialog-width: var(--dialog-xlarge-width);
    --dialog-height: var(--dialog-xlarge-height);
}}

.slice {{
    min-width: 0;
    min-height: 0;
}}

.slice-tl {{ background: url("tl.png") no-repeat center / 100% 100%; }}
.slice-top {{ background: url("top.png") repeat-x center / auto 100%; }}
.slice-tr {{ background: url("tr.png") no-repeat center / 100% 100%; }}
.slice-left {{ background: url("left.png") repeat-y center / 100% auto; }}
.slice-middle {{ background: url("middle.png") repeat center / auto auto; }}
.slice-right {{ background: url("right.png") repeat-y center / 100% auto; }}
.slice-bl {{ background: url("bl.png") no-repeat center / 100% 100%; }}
.slice-bot {{ background: url("bot.png") repeat-x center / auto 100%; }}
.slice-br {{ background: url("br.png") no-repeat center / 100% 100%; }}

/* Overlay content sits over the center and edges. */
.dialog-content {{
    position: absolute;
    inset: var(--slice-top) var(--slice-right) var(--slice-bottom) var(--slice-left);
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    color: var(--ink-main);
}}

.dialog-title-region {{
    position: absolute;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: "Modern Antiqua", serif;
    font-weight: 400;
    font-style: normal;
    color: {title_color};
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    {title_position_css}
}}

.dialog-title {{
    margin: 0;
    font-size: 14pt;
    line-height: 1.1;
}}

.dialog-subtitle {{
    margin: 0 0 14px;
    font-size: 0.95rem;
    opacity: 0.78;
}}

.dialog-close {{
    position: absolute;
    z-index: 4;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    background-color: transparent;
    background-repeat: no-repeat;
    background-position: center;
    background-size: 100% 100%;
    cursor: pointer;
    {close_position_css}
}}
{close_css}
.dialog-body {{
    flex: 1 1 auto;
    min-height: 0;
    {body_padding}
    overflow: auto;
    line-height: 1.55;
}}

.dialog-body p:first-child {{
    margin-top: 0;
}}

.dialog-actions {{
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 10px;
    padding: 0 22px 22px;
}}

.dialog-actions button {{
    min-width: 96px;
    padding: 10px 14px;
    font: inherit;
    color: var(--ink-soft);
    background: linear-gradient(180deg, #8b6744, var(--wood-dark));
    border: 1px solid rgba(41, 21, 10, 0.72);
    border-radius: 12px;
    box-shadow: inset 0 1px 0 rgba(255, 240, 220, 0.25);
    cursor: pointer;
}}

.dialog-actions button.secondary {{
    background: linear-gradient(180deg, #6b778b, #465063);
}}

@media (min-width: 1300px) {{
    .dialog-window:not(.size-small):not(.size-large):not(.size-xlarge) {{
        --dialog-width: var(--dialog-large-width);
        --dialog-height: var(--dialog-large-height);
    }}
}}

@media (min-width: 1600px) {{
    .dialog-window:not(.size-small):not(.size-large):not(.size-xlarge) {{
        --dialog-width: var(--dialog-xlarge-width);
        --dialog-height: var(--dialog-xlarge-height);
    }}
}}

@media (max-width: 700px) {{
    .demo-stage {{
        padding: 14px;
    }}

    .dialog-host {{
        padding: 0;
    }}

    .dialog-window {{
        width: 100vw;
        height: 100vh;
        max-width: none;
        max-height: none;
    }}
}}
"""


def js_text(
    base_name: str,
    dims: dict[str, tuple[int, int]],
    manifest: dict | None,
) -> str:
    has_corner = "corner-tl.png" in dims
    has_title_area = bool(manifest and manifest.get("title_area"))
    return f"""// {base_name}.js
// Generated by 9slice.py.

(function () {{
    var HAS_CORNER_OVERLAY = {"true" if has_corner else "false"};
    var HAS_TITLE_REGION = {"true" if has_title_area else "false"};

    function el(tag, className, text) {{
        var node = document.createElement(tag);
        if (className) {{
            node.className = className;
        }}
        if (typeof text === "string") {{
            node.textContent = text;
        }}
        return node;
    }}

    function buildSlices(frame) {{
        var classes = [
            "slice slice-tl",
            "slice slice-top",
            "slice slice-tr",
            "slice slice-left",
            "slice slice-middle",
            "slice slice-right",
            "slice slice-bl",
            "slice slice-bot",
            "slice slice-br"
        ];

        classes.forEach(function (className) {{
            frame.appendChild(el("div", className));
        }});
    }}

    function buildCorners(frame) {{
        if (!HAS_CORNER_OVERLAY) {{
            return;
        }}

        [
            "dialog-corner dialog-corner-tl",
            "dialog-corner dialog-corner-tr",
            "dialog-corner dialog-corner-bl",
            "dialog-corner dialog-corner-br"
        ].forEach(function (className) {{
            frame.appendChild(el("div", className));
        }});
    }}

    function resizeWindow(dialog, width, height) {{
        if (width) {{
            dialog.style.setProperty("--dialog-width", width + "px");
        }}
        if (height) {{
            dialog.style.setProperty("--dialog-height", height + "px");
        }}
    }}

    function closeDialog(host) {{
        if (host && host.parentNode) {{
            host.parentNode.removeChild(host);
        }}
    }}

    function createDialogWindow(config) {{
        var host = el("div", "dialog-host");
        var frame = el("section", "dialog-window " + (config.sizeClass || "size-medium"));
        var content = el("div", "dialog-content");
        var titleRegion = el("div", "dialog-title-region");
        var title = el("h2", "dialog-title", config.title || "Dialog Window");
        var close = el("button", "dialog-close");
        var body = el("div", "dialog-body");
        var actions = el("footer", "dialog-actions");
        var subtitle;

        buildSlices(frame);
        buildCorners(frame);

        if (HAS_TITLE_REGION) {{
            titleRegion.appendChild(title);
            frame.appendChild(titleRegion);
        }}

        close.type = "button";
        close.setAttribute("aria-label", "Close window");
        close.textContent = " ";
        close.addEventListener("click", function () {{
            closeDialog(host);
        }});

        if (config.subtitle) {{
            subtitle = el("p", "dialog-subtitle", config.subtitle);
            body.appendChild(subtitle);
        }}

        if (typeof config.bodyHtml === "string") {{
            var copy = document.createElement("div");
            copy.innerHTML = config.bodyHtml;
            while (copy.firstChild) {{
                body.appendChild(copy.firstChild);
            }}
        }}

        (config.actions || []).forEach(function (action) {{
            var button = el("button", action.secondary ? "secondary" : "", action.label);
            button.type = "button";
            button.addEventListener("click", function () {{
                if (typeof action.onClick === "function") {{
                    action.onClick({{
                        host: host,
                        dialog: frame,
                        body: body,
                        close: function () {{
                            closeDialog(host);
                        }},
                        resize: function (width, height) {{
                            resizeWindow(frame, width, height);
                        }}
                    }});
                }} else {{
                    closeDialog(host);
                }}
            }});
            actions.appendChild(button);
        }});

        content.appendChild(body);
        content.appendChild(actions);
        frame.appendChild(content);
        frame.appendChild(close);
        host.appendChild(frame);
        document.body.appendChild(host);

        if (config.width || config.height) {{
            resizeWindow(frame, config.width, config.height);
        }}

        return {{
            host: host,
            dialog: frame,
            body: body,
            close: function () {{
                closeDialog(host);
            }},
            resize: function (width, height) {{
                resizeWindow(frame, width, height);
            }}
        }};
    }}

    function wireDemoButtons() {{
        var demoButtons = document.querySelectorAll("[data-dialog-demo]");

        function removeExistingDialogs() {{
            document.querySelectorAll(".dialog-host").forEach(function (node) {{
                node.parentNode.removeChild(node);
            }});
        }}

        function openSmallConfirm() {{
            removeExistingDialogs();
            createDialogWindow({{
                sizeClass: "size-small",
                title: "Confirm Action",
                subtitle: "Compact confirmation window",
                bodyHtml: "<p>Do you want to replace the current save slot with the most recent autosave?</p>",
                actions: [
                    {{ label: "No", secondary: true }},
                    {{ label: "Yes" }}
                ]
            }});
        }}

        function openInfoWindow() {{
            removeExistingDialogs();
            createDialogWindow({{
                sizeClass: "size-medium",
                title: "Expedition Briefing",
                subtitle: "Default 800 × 600 desktop window",
                bodyHtml:
                    "<p>The information layout is built around your exported 9-slice textures. The center panel can scroll while the decorative frame remains intact.</p>" +
                    "<p>This default preset fills the phone screen on small devices and grows on larger displays.</p>" +
                    "<p>Use this mode for inventory, codex, quests, or a richer dialog scene with multiple sections of text.</p>",
                actions: [
                    {{ label: "Dismiss", secondary: true }},
                    {{ label: "Open Large", onClick: function (api) {{ api.resize(960, 680); }} }}
                ]
            }});
        }}

        function openLargeWindow() {{
            removeExistingDialogs();
            createDialogWindow({{
                sizeClass: "size-large",
                title: "World Atlas",
                subtitle: "Expanded presentation window",
                bodyHtml:
                    "<p>This larger preset is useful for maps, settings panels, and denser information views.</p>" +
                    "<p>Lorem ipsum replacement text goes here so you can immediately test scrolling and edge tiling across a taller content surface.</p>" +
                    "<p>Resize can still be driven in JavaScript with <code>resizeWindow</code> or via the returned dialog API.</p>" +
                    "<p>On an extra large screen the generated CSS also includes a wider preset so you can keep the layout from feeling cramped.</p>",
                actions: [
                    {{ label: "Close", secondary: true }},
                    {{ label: "Go XL", onClick: function (api) {{ api.resize(1120, 760); }} }}
                ]
            }});
        }}

        var handlers = {{
            confirm: openSmallConfirm,
            info: openInfoWindow,
            large: openLargeWindow
        }};

        demoButtons.forEach(function (button) {{
            button.addEventListener("click", function () {{
                var demo = button.getAttribute("data-dialog-demo");
                if (handlers[demo]) {{
                    handlers[demo]();
                }}
            }});
        }});

        openInfoWindow();
    }}

    window.createDialogWindow = createDialogWindow;
    window.resizeWindow = resizeWindow;

    if (document.readyState === "loading") {{
        document.addEventListener("DOMContentLoaded", wireDemoButtons);
    }} else {{
        wireDemoButtons();
    }}
}})();
"""


def html_text(base_name: str) -> str:
    title = f"{base_name} 9-Slice Demo"
    return f"""<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Macondo&family=Modern+Antiqua&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="{base_name}.css">
</head>
<body>
    <main class="demo-stage">
        <div class="demo-toolbar">
            <button type="button" data-dialog-demo="confirm">Small Confirm</button>
            <button type="button" data-dialog-demo="info">Info Window</button>
            <button type="button" data-dialog-demo="large">Large Window</button>
        </div>
        <p class="demo-note">
            This wrapper previews a responsive 9-slice dialog using the exported PNG pieces in this folder.
            On mobile the dialog fills the screen. On desktop it defaults to 800 by 600, with larger presets for wider displays.
        </p>
    </main>
    <script src="{base_name}.js"></script>
</body>
</html>
"""


def write_outputs(folder: Path, dims: dict[str, tuple[int, int]]) -> list[Path]:
    base_name = folder.name
    manifest = load_manifest(folder)
    outputs = {
        folder / f"{base_name}.css": css_text(base_name, dims, manifest),
        folder / f"{base_name}.js": js_text(base_name, dims, manifest),
        folder / f"{base_name}.html": html_text(base_name),
    }

    for path, contents in outputs.items():
        path.write_text(contents, encoding="utf-8")

    return list(outputs.keys())


def main() -> None:
    args = parse_args()
    folder = resolve_folder(args.folder)
    dims = collect_dimensions(folder)
    written = write_outputs(folder, dims)

    print(f"Reviewed 9-slice assets in {folder}")
    for name in REQUIRED_SLICES:
        width, height = dims[name]
        print(f"  {name}: {width}x{height}")

    for path in written:
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
