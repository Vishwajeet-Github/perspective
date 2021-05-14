/******************************************************************************
 *
 * Copyright (c) 2018, the Perspective Authors.
 *
 * This file is part of the Perspective library, distributed under the terms of
 * the Apache License 2.0.  The full license can be found in the LICENSE file.
 *
 */

import {get_type_config} from "@finos/perspective/dist/esm/config";
import {dragend} from "./dragdrop.js";
import {renderers} from "./renderers.js";

import {PerspectiveElement} from "./perspective_element.js";
import {html, render} from "lit-html";
import {findExpressionByAlias, getExpressionAlias, getRawExpression} from "../utils.js";

/**
 * Render `<option>` blocks
 * @param {*} names name objects
 */
const options = vals => {
    const opts = [];
    for (let name in vals) {
        opts.push(html`
            <option value="${name}">${vals[name].name || name}</option>
        `);
    }
    return opts;
};

export class DomElement extends PerspectiveElement {
    _clear_columns() {
        this._inactive_columns.innerHTML = "";
        this._active_columns.innerHTML = "";
    }

    set_aggregate_attribute(aggs) {
        let is_set = false;
        let aggregates = aggs.reduce((obj, agg) => {
            if (this._aggregate_defaults[agg.column] !== agg.op) {
                obj[agg.column] = agg.op;
                is_set = true;
            }
            return obj;
        }, {});
        if (is_set) {
            this.setAttribute("aggregates", JSON.stringify(aggregates));
        } else {
            this.removeAttribute("aggregates");
        }
    }

    _get_type(name) {
        let all = this._get_view_inactive_columns();
        if (all.length > 0) {
            const type = all.find(x => x.getAttribute("name") === name);
            if (type) {
                return type.getAttribute("type");
            } else {
                return "integer";
            }
        } else {
            return "";
        }
    }

    _set_row_type(row) {
        const weights = this._get_view_inactive_columns()
            .filter(x => x.getAttribute("type") === "integer" || x.getAttribute("type") === "float")
            .map(x => x.getAttribute("name"));
        row.set_weights(weights);
        row.setAttribute("type", this._get_type(row.getAttribute("name")));
    }

    // Generates a new row in state + DOM
    _new_row(name, type, aggregate, filter, sort, expression) {
        let row = document.createElement("perspective-row");
        type = type || this._get_type(name);

        if (!aggregate) {
            let aggregates = this.get_aggregate_attribute();
            if (aggregates) {
                aggregate = aggregates.find(x => x.column === name);
                if (aggregate) {
                    aggregate = aggregate.op;
                } else {
                    aggregate = get_type_config(type).aggregate;
                }
            } else {
                aggregate = get_type_config(type).aggregate;
            }
        }

        if (filter) {
            row.setAttribute("filter", filter);

            if (type === "string" || type === "date" || type === "datetime") {
                // Get all unique values for the column - because all options
                // must be valid column names, recreate expressions if the
                // expression is in the filter.
                const expressions = this._get_view_expressions();
                // either the expression string or undefined
                let expression = findExpressionByAlias(name, expressions);

                // If the filter is an expression, we need to recreate the
                // expression column.
                this._table
                    .view({
                        row_pivots: [name],
                        columns: [],
                        expressions: expression ? [expression] : []
                    })
                    .then(async view => {
                        // set as a property so we can delete it after the
                        // autocomplete choices are set.
                        this._filter_view = view;
                        let nrows = await view.num_rows();

                        if (nrows < 100000) {
                            // Autocomplete
                            const json = await view.to_json({
                                end_row: 10
                            });
                            row.choices(this._autocomplete_choices(json, type));
                        } else {
                            console.warn(`perspective-viewer did not generate autocompletion results - ${nrows} is greater than limit of 100,000 rows.`);
                        }
                    })
                    .finally(() => {
                        // Clean up the View on the Emscripten heap.
                        this._filter_view?.delete();
                        delete this._filter_view;
                    });
            }
        }

        if (sort) {
            row.setAttribute("sort-order", sort);
        } else {
            if (this._get_view_column_pivots().indexOf(name) > -1) {
                row.setAttribute("sort-order", "col asc");
            } else {
                row.setAttribute("sort-order", "asc");
            }
        }

        const weights = this._get_view_inactive_columns()
            .filter(x => x.getAttribute("type") === "integer" || x.getAttribute("type") === "float")
            .map(x => x.getAttribute("name"));
        row.set_weights(weights);

        if (name === null) {
            row.classList.add("null-column");
        } else {
            row.setAttribute("type", type);
            row.setAttribute("name", name);
        }

        row.setAttribute("aggregate", Array.isArray(aggregate) ? JSON.stringify(aggregate) : aggregate);

        row.addEventListener("visibility-clicked", this._column_visibility_clicked.bind(this));
        row.addEventListener("aggregate-selected", this._column_aggregate_clicked.bind(this));
        row.addEventListener("filter-selected", this._column_filter_clicked.bind(this));
        row.addEventListener("close-clicked", event => dragend.call(this, event.detail));
        row.addEventListener("sort-order", this._sort_order_clicked.bind(this));

        row.addEventListener("row-drag", () => {
            this.classList.add("dragging");
            this._original_index = Array.prototype.slice.call(this._active_columns.children).findIndex(x => x.getAttribute("name") === name);
            if (this._original_index !== -1) {
                this._drop_target_hover = this._active_columns.children[this._original_index];
                setTimeout(() => row.setAttribute("drop-target", true));
            } else {
                this._drop_target_hover = this._new_row(name, type, aggregate);
            }
        });
        row.addEventListener("row-dragend", () => {
            this.classList.remove("dragging");
        });

        if (expression) {
            row.classList.add("expression");

            // used by the viewer to diff expression columns
            row.setAttribute("expression", expression);

            // expression without the newline alias - allows us to hover
            // and see the expression as typed by the user.
            const raw_expr = getRawExpression(expression);
            row.setAttribute("title", raw_expr);
        }

        return row;
    }

    /**
     * Add expression columns to the DOM.
     *
     * @param {*} expressions
     * @param {*} expression_schema
     */
    _update_expressions_view(expressions, expression_schema) {
        const active = this._get_view_active_column_names();
        const inactive = this._get_view_inactive_column_names();

        if (expressions.length === 0) {
            return;
        }

        let inactive_added_count = 0;

        // When restore is called, if the expression is in `columns` but
        // `columns` is set before `expressions`, it will cause an error
        // so we need to reset the columns view and re-render the active
        // and inactive panel if that happens.
        const columns_attr = JSON.parse(this.getAttribute("columns")) || [];
        let reset_columns_view = false;

        for (const expr of expressions) {
            // All expressions are guaranteed to have an alias at this point,
            // so we can skip the expression if it somehow does not.
            const alias = getExpressionAlias(expr);

            if (alias === undefined) {
                console.warn(`Not applying expression ${expr} as it does not have an alias set.`);
                continue;
            }

            // Check for whether an expression column is used in the columns
            // attribute but hasn't been created yet - if we don't reset
            // the columns view, it can cause an `abort()` error that can't
            // be recovered from.
            const should_reset = columns_attr.includes(alias) && !inactive.includes(alias);

            if (should_reset) {
                reset_columns_view = true;
            }

            let row;
            const expression_type = expression_schema[alias];

            // If the column is in the active DOM, re-render the column
            // with the new expression type and expression string.
            if (active.includes(alias) && !inactive.includes(alias)) {
                console.log(this._get_view_active_columns());
                const expression_row = this._get_view_active_columns().filter(x => x.getAttribute("name") == alias);
                console.log(expression_row);
                if (expression_row.length > 0 && expression_row[0]) {
                    // Reset the expression on hover, the data type, and
                    // the aggregate attribute.
                    const aggregate = get_type_config(expression_type).aggregate;
                    expression_row[0].setAttribute("aggregate", aggregate);
                    expression_row[0].setAttribute("expression", expr);
                    expression_row[0].setAttribute("type", expression_type);

                    const weights = this._get_view_inactive_columns()
                        .filter(x => x.getAttribute("type") === "integer" || x.getAttribute("type") === "float")
                        .map(x => x.getAttribute("name"));
                    expression_row[0].set_weights(weights);
                }

                // Needs a DOM reset of the columns attribute.
                // reset_columns_view = true;
            } else {
                // A new expression column which will be added to the top of
                // the inactive columns list.
                row = this._new_row(alias, expression_type, null, null, null, expr);
                this._inactive_columns.insertBefore(row, this._inactive_columns.childNodes[0] || null);
                inactive_added_count++;
            }
        }

        if (reset_columns_view) {
            this._update_column_view(columns_attr, true);
        } else {
            // Remove collapse so that new inactive columns show up
            if (inactive_added_count > 0 && this._inactive_columns.parentElement.classList.contains("collapse")) {
                this._inactive_columns.parentElement.classList.remove("collapse");
            }
        }
    }

    /**
     * Given a dictionary of active expression alias to expression strings from
     * the DOM, inactive alias to expression strings from the DOM, and the
     * new expressions attribute to apply, return a list of expressions that
     * need to be removed from the DOM and from attributes. The expressions that
     * should be removed are expressions that are in the DOM but not in the
     * attributes, and expressions that have been replaced in the attribute
     * by a new expression with the same alias.
     *
     * @param {Object} old_active
     * @param {Object} old_inactive
     * @param {Array<String>} new_expressions
     * @returns Object
     */
    _diff_expressions(old_active, old_inactive, new_expressions) {
        const to_remove = {};
        const alias_map = {};

        for (const expr of new_expressions) {
            const alias = getExpressionAlias(expr);
            alias_map[alias] = expr;
        }

        console.log(alias_map, old_active, old_inactive, new_expressions);

        for (const alias in old_active) {
            // If the new expression uses the same alias but replaces the
            // expression, or if the old alias does not exist in the
            // new expressions, remove it.
            if (alias_map[alias] === undefined || old_active[alias] !== alias_map[alias]) {
                to_remove[alias] = old_active[alias];
            }
        }

        for (const alias in old_inactive) {
            if (alias_map[alias] === undefined || old_inactive[alias] !== alias_map[alias]) {
                to_remove[alias] = old_inactive[alias];
            }
        }

        console.log(to_remove);
        return to_remove;
    }

    /**
     * When the `expressions` attribute is set to null, undefined, or [] or
     * is unset, or when required, remove expression columns from the
     * viewer. If `expressions` is undefined, all expressions are removed,
     * otherwise the specified expressions will be removed.
     *
     * @param {Object} expressions
     */
    _reset_expressions_view(expressions_map) {
        if (expressions_map) {
            // Only remove columns specified in `expressions`
            const columns = this._get_view_active_column_names().filter(x => expressions_map[x] === undefined);
            const aggregates = this._get_view_aggregates().filter(x => expressions_map[x.column] === undefined);
            const rp = this._get_view_row_pivots().filter(x => expressions_map[x] === undefined);
            const cp = this._get_view_column_pivots().filter(x => expressions_map[x] === undefined);
            const sort = this._get_view_sorts().filter(x => expressions_map[x[0]] === undefined);
            const filters = this._get_view_filters().filter(x => !expressions_map[x[0]] === undefined);

            // Aggregates as an array is from the attribute API
            this.set_aggregate_attribute(aggregates);

            this.setAttribute("columns", JSON.stringify(columns));
            this.setAttribute("row-pivots", JSON.stringify(rp));
            this.setAttribute("column-pivots", JSON.stringify(cp));
            this.setAttribute("sort", JSON.stringify(sort));
            this.setAttribute("filters", JSON.stringify(filters));
        } else {
            // `expressions` is empty, so remove all columns that do not
            // exist on the underlying table.
            if (this._table) {
                this._table.columns().then(table_columns => {
                    const columns = this._get_view_active_column_names().filter(x => table_columns.includes(x));
                    const aggregates = this._get_view_aggregates().filter(x => table_columns.includes(x.column));
                    const rp = this._get_view_row_pivots().filter(x => table_columns.includes(x));
                    const cp = this._get_view_column_pivots().filter(x => table_columns.includes(x));
                    const sort = this._get_view_sorts().filter(x => table_columns.includes(x[0]));
                    const filters = this._get_view_filters().filter(x => table_columns.includes(x[0]));

                    // Aggregates as an array is from the attribute API
                    this.set_aggregate_attribute(aggregates);

                    this.setAttribute("columns", JSON.stringify(columns));
                    this.setAttribute("row-pivots", JSON.stringify(rp));
                    this.setAttribute("column-pivots", JSON.stringify(cp));
                    this.setAttribute("sort", JSON.stringify(sort));
                    this.setAttribute("filters", JSON.stringify(filters));
                });
            } else {
                // this would happen if you tried to set expressions without
                // a table, and then restored/removed expressions/tried to apply
                // an invalid expression. In this case just reset the viewer.
                this.removeAttribute("columns");
                this.removeAttribute("row-pivots");
                this.removeAttribute("column-pivots");
                this.removeAttribute("sort");
                this.removeAttribute("filters");
                this.removeAttribute("aggregates");
            }
        }

        // Remove all inactive expression columns from the DOM
        const inactive_expressions = this._get_view_inactive_columns().filter(x => x.classList.contains("expression"));

        for (const expr of inactive_expressions) {
            this._inactive_columns.removeChild(expr);
        }

        // Re-check on whether to collapse inactive columns
        const pop_cols = this._get_view_active_columns().filter(x => typeof x !== "undefined" && x !== null);
        const lis = this._get_view_inactive_columns();

        if (pop_cols.length === lis.length) {
            this._columns_container.classList.add("collapse");
        } else {
            this._columns_container.classList.remove("collapse");
        }
    }

    _update_column_view(columns, reset = false) {
        if (!columns) {
            columns = this._get_view_active_column_names();
        }

        if (this._plugin.initial && this._plugin.initial.names) {
            while (columns.length < this._plugin.initial.names.length) {
                columns.push(null);
            }
        }

        // If columns were not passed in, this is needed to keep the attribute
        // API in sync with DOM state.
        this.setAttribute("columns", JSON.stringify(columns));

        const pop_cols = columns.filter(x => typeof x !== "undefined" && x !== null);
        const lis = this._get_view_inactive_columns();
        if (pop_cols.length === lis.length) {
            this._columns_container.classList.add("collapse");
        } else {
            this._columns_container.classList.remove("collapse");
        }
        lis.forEach(x => {
            const index = pop_cols.indexOf(x.getAttribute("name"));
            if (index === -1) {
                x.classList.remove("active");
            } else {
                x.classList.add("active");
            }
        });
        if (reset) {
            this._update_column_list(columns, this._active_columns, (name, expressions) => {
                if (name === null) {
                    return this._new_row(null);
                } else {
                    const ref = lis.find(x => x.getAttribute("name") === name);
                    if (ref) {
                        const name = ref.getAttribute("name");
                        // either the expression string or undefined
                        let expression = findExpressionByAlias(name, expressions);
                        return this._new_row(name, ref.getAttribute("type"), undefined, undefined, undefined, expression);
                    }
                }
            });
        }
    }

    _update_column_list(columns, container, callback, accessor) {
        accessor = accessor || ((x, y) => y.getAttribute("name") === x);
        const active_columns = Array.prototype.slice.call(container.children);

        // Make sure the `expression` class and attribute is set on expressions
        const expressions = this._get_view_expressions();

        for (let i = 0, j = 0; i < active_columns.length || j < columns.length; i++, j++) {
            const name = columns[j];
            const col = active_columns[i];
            const next_col = active_columns[i + 1];
            if (!col) {
                const node = callback(name, expressions);
                if (node) {
                    container.appendChild(node);
                }
            } else if (typeof name === "undefined") {
                container.removeChild(col);
            } else if (accessor(name, col)) {
                this._set_row_type(col);
            } else {
                if (col.classList.contains("null-column")) {
                    const node = callback(name, expressions);
                    if (node) {
                        container.replaceChild(node, col);
                    }
                } else if (next_col && accessor(name, next_col)) {
                    container.removeChild(col);
                    i++;
                    //  j--;
                } else {
                    const node = callback(name, expressions);
                    if (node) {
                        container.insertBefore(node, col);
                        i--;
                    }
                }
            }
        }
    }

    _set_row_styles() {
        let style = "";
        if (this._plugin.initial && this._plugin.initial.names) {
            for (const nidx in this._plugin.initial.names) {
                const name = this._plugin.initial.names[nidx];
                style += `#active_columns perspective-row:nth-child(${parseInt(nidx) + 1}){margin-top:23px;}`;
                style += `#active_columns perspective-row:nth-child(${parseInt(nidx) + 1}):before{content:"${name}";}`;
            }
        }
        this.shadowRoot.querySelector("#psp_styles").innerHTML = style;
    }

    _show_column_container() {
        this.shadowRoot.querySelector("#columns_container").style.visibility = "visible";
    }

    _show_side_panel_actions() {
        this.shadowRoot.querySelector("#side_panel__actions").style.visibility = "visible";
    }

    _remove_null_columns(since_index = 0) {
        const elems = this._get_view_active_columns();
        while (++since_index < elems.length) {
            const elem = elems[since_index];
            if (elem.classList.contains("null-column")) {
                this.shadowRoot.querySelector("#active_columns").removeChild(elem);
            }
        }
    }

    _set_column_defaults() {
        const cols = this._get_view_inactive_columns();
        const active_cols = this._get_view_active_valid_columns();
        const valid_active_cols = this._get_view_active_valid_column_names();
        if (cols.length > 0) {
            if (this._plugin.initial) {
                let pref = [];
                let count = this._plugin.initial.count || 2;
                this._fill_numeric(active_cols, pref);
                this._fill_numeric(cols, pref);
                this._fill_numeric(cols, pref, true);
                pref = pref.slice(0, count);
                const labels = this._plugin.initial.names;
                while (labels && pref.length < labels.length) {
                    pref.push(null);
                }
                this.setAttribute("columns", JSON.stringify(pref));
            } else if (this._plugin.selectMode === "select") {
                this.setAttribute("columns", JSON.stringify([cols[0].getAttribute("name")]));
            } else {
                this.setAttribute("columns", JSON.stringify(valid_active_cols));
                this._remove_null_columns();
            }
        }
    }

    _fill_numeric(cols, pref, bypass = false) {
        for (let col of cols) {
            let type = col.getAttribute("type");
            let name = col.getAttribute("name");
            if (bypass || (["float", "integer"].indexOf(type) > -1 && pref.indexOf(name) === -1)) {
                pref.push(name);
            }
        }
    }

    async _check_responsive_layout() {
        if (this.shadowRoot) {
            const app = this.shadowRoot.querySelector("#app");
            if (this.clientHeight < 500 && this.clientWidth > 600 && this._get_view_columns({active: false}).length > this._get_view_columns().length) {
                if (!app.classList.contains("columns_horizontal")) {
                    const old = this._persisted_side_panel_width;
                    this._persisted_side_panel_width = this._side_panel.style.width;
                    this._side_panel.style.width = old || "";
                    app.classList.add("columns_horizontal");
                }
            } else if (app.classList.contains("columns_horizontal")) {
                const panel = this.shadowRoot.querySelector("#pivot_chart_container");
                panel.clientWidth + this._side_panel.clientWidth;
                const width = this._persisted_side_panel_width || panel.clientWidth + this._side_panel.clientWidth / 2;
                const height = panel.clientHeight + 50;
                await this._pre_resize(width, height, () => {
                    const old = this._persisted_side_panel_width;
                    this._persisted_side_panel_width = this._side_panel.style.width;
                    this._side_panel.style.width = old || "";
                    app.classList.remove("columns_horizontal");
                });
                return true;
            }

            // else if (this.clientWidth < 600 && this.clientHeight < 500) {
            // if (!app.classList.contains("responsive_collapse_2")) {
            //     app.classList.add("responsive_collapse_2");
            // }
            // } else if (app.classList.contains("responsive_collapse_2")) {
            // app.classList.remove("responsive_collapse_2");
            // }
            return false;
        }
        return false;
    }

    // setup functions
    _register_ids() {
        this._app = this.shadowRoot.querySelector("#app");
        this._aggregate_selector = this.shadowRoot.querySelector("#aggregate_selector");
        this._vis_selector = this.shadowRoot.querySelector("#vis_selector");
        this._filters = this.shadowRoot.querySelector("#filters");
        this._row_pivots = this.shadowRoot.querySelector("#row_pivots");
        this._column_pivots = this.shadowRoot.querySelector("#column_pivots");
        this._datavis = this.shadowRoot.querySelector("#pivot_chart");
        this._active_columns = this.shadowRoot.querySelector("#active_columns");
        this._inactive_columns = this.shadowRoot.querySelector("#inactive_columns");
        this._side_panel_actions = this.shadowRoot.querySelector("#side_panel__actions");
        this._add_expression_button = this.shadowRoot.querySelector("#add-expression");
        this._expression_editor = this.shadowRoot.querySelector("perspective-expression-editor");
        this._side_panel = this.shadowRoot.querySelector("#side_panel");
        this._top_panel = this.shadowRoot.querySelector("#top_panel");
        this._sort = this.shadowRoot.querySelector("#sort");
        this._transpose_button = this.shadowRoot.querySelector("#transpose_button");
        this._plugin_information = this.shadowRoot.querySelector(".plugin_information");
        this._plugin_information_action = this.shadowRoot.querySelector(".plugin_information__action");
        this._plugin_information_message = this.shadowRoot.querySelector("#plugin_information_count");
        this._columns_container = this.shadowRoot.querySelector("#columns_container");
        this._vieux = this.shadowRoot.querySelector("perspective-vieux");
    }

    // sets state, manipulates DOM
    _register_view_options() {
        let current_renderers = renderers.getInstance();
        render(options(current_renderers), this._vis_selector);
    }

    _autocomplete_choices(json, type) {
        const choices = [];
        const type_config = get_type_config(type);

        for (let i = 1; i < json.length; i++) {
            const row_path = json[i].__ROW_PATH__;
            if (Array.isArray(row_path) && row_path.length > 0 && row_path[0]) {
                let choice = row_path[0];

                if (type === "date" || type === "datetime") {
                    choice = new Date(choice);
                    choice = choice.toLocaleString("en-US", type_config.format);
                }

                choices.push(choice);
            }
        }
        return choices;
    }
}
