// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

import { h, VirtualElement } from "@lumino/virtualdom/src";
import { Menu } from "@lumino/widgets/src/menu";

/// The underlying renderer for the workspace context menu.
export class MenuRenderer extends Menu.Renderer {
    formatLabel(data: Menu.IRenderData) {
        let { label, mnemonic } = data.item;
        if (mnemonic < 0 || mnemonic >= label.length) {
            return label;
        }

        let prefix = label.slice(0, mnemonic);
        let suffix = label.slice(mnemonic + 1);
        let char = label[mnemonic];
        let span = h.span(
            {
                className: "lm-Menu-itemMnemonic p-Menu-itemMnemonic",
            },
            char
        );

        return [prefix, span, suffix];
    }

    renderLabel(data: Menu.IRenderData) {
        let content = this.formatLabel(data);
        return h.div(
            {
                className: "lm-Menu-itemLabel",
            },
            content
        );
    }

    renderSubmenu(_data: Menu.IRenderData) {
        return h.div({
            className: "lm-Menu-itemSubmenuIcon",
        });
    }

    renderItem(data: Menu.IRenderData): VirtualElement {
        let className = this.createItemClass(data);
        let dataset = this.createItemDataset(data);
        let aria = this.createItemARIA(data);
        return h.li(
            {
                className,
                dataset,
                tabindex: "0",
                onfocus: data.onfocus,
                ...aria,
            },
            this.renderLabel(data),
            this.renderShortcut(data),
            this.renderSubmenu(data)
        );
    }
}