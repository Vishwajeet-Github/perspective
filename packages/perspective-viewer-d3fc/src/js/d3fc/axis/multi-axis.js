import {select, line} from "d3";
import {dataJoin, rebindAll, exclude} from "d3fc";
import {axisTop, axisBottom, axisLeft, axisRight} from "./axis";
import store from "../chart/store";

const multiAxis = (orient, baseAxis, scale) => {
    let axisStore = store("tickFormat", "ticks", "tickArguments", "tickSize", "tickSizeInner", "tickSizeOuter", "tickValues", "tickPadding", "centerAlignTicks");
    let decorate = () => {};

    let groups = null;

    const groupDataJoin = dataJoin("g", "group");
    const domainPathDataJoin = dataJoin("path", "domain");

    const translate = (x, y) => (isVertical() ? `translate(${y}, ${x})` : `translate(${x}, ${y})`);

    const pathTranspose = arr => (isVertical() ? arr.map(d => [d[1], d[0]]) : arr);

    const isVertical = () => orient === "left" || orient === "right";

    const multiAxis = selection => {
        if (!groups) {
            axisStore(baseAxis(scale).decorate(decorate))(selection);
            return;
        }

        if (selection.selection) {
            groupDataJoin.transition(selection);
            domainPathDataJoin.transition(selection);
        }

        selection.each((data, index, group) => {
            const element = group[index];

            const container = select(element);

            const sign = orient === "bottom" || orient === "right" ? 1 : -1;

            // add the domain line
            const range = scale.range();
            const tickSizeOuter = groups.length * multiAxis.tickSizeOuter();
            const domainPathData = pathTranspose([[range[0], sign * tickSizeOuter], [range[0], 0], [range[1], 0], [range[1], sign * tickSizeOuter]]);

            const domainLine = domainPathDataJoin(container, [data]);
            domainLine
                .attr("d", line()(domainPathData))
                .attr("stroke", "#000")
                .attr("fill", "none");

            const g = groupDataJoin(container, groups);

            // enter
            g.enter().attr("transform", (d, i) => translate(0, sign * i * multiAxis.tickSizeInner()));

            g.each((group, i, nodes) => {
                const groupElement = select(nodes[i]);
                const groupScale = scaleFromGroup(scale, group);
                axisStore(baseAxis(groupScale).decorate(decorate)).tickOffset(d => groupScale.step(d) / 2)(groupElement);

                groupElement.select("path.domain").attr("visibility", "hidden");
            });

            // exit
            g.exit().attr("transform", translate(0, sign * index * multiAxis.tickSizeInner()));
        });
    };

    const scaleFromGroup = (scale, group) => {
        function customScale(value) {
            const values = value.domain;
            return values.reduce((sum, d) => sum + scale(d), 0) / values.length;
        }

        customScale.ticks = () => {
            return group;
        };
        customScale.tickFormat = () => d => {
            return d.text;
        };

        customScale.step = value => value.domain.length * scale.step();

        rebindAll(customScale, scale, exclude("ticks", "step"));
        return customScale;
    };

    multiAxis.decorate = (...args) => {
        if (!args.length) {
            return decorate;
        }
        decorate = args[0];
        return multiAxis;
    };

    multiAxis.groups = (...args) => {
        if (!args.length) {
            return groups;
        }
        groups = args[0];
        return multiAxis;
    };

    rebindAll(multiAxis, axisStore);

    return multiAxis;
};

export const multiAxisTop = scale => multiAxis("top", axisTop, scale);

export const multiAxisBottom = scale => multiAxis("bottom", axisBottom, scale);

export const multiAxisLeft = scale => multiAxis("left", axisLeft, scale);

export const multiAxisRight = scale => multiAxis("right", axisRight, scale);
