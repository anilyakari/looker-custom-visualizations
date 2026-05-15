looker.visualization.add({
    id: "advanced_expanded_matrix_v2",
    label: "Dynamic N-Level Matrix",
    options: {
        show_subtotals: {
            type: "boolean",
            label: "Show Subtotals",
            default: true
        }
    },

    create: function(element, config) {
        this.container = document.createElement("div");
        this.container.style.width = "100%";
        this.container.style.height = "100%";
        this.container.style.overflow = "auto";
        this.container.style.fontFamily = "Arial, sans-serif";
        element.appendChild(this.container);
        
        const style = document.createElement('style');
        style.innerHTML = `
            .custom-matrix { border-collapse: collapse; width: 100%; font-size: 12px; }
            .custom-matrix th, .custom-matrix td { border: 1px solid #ccc; padding: 6px; text-align: right; white-space: nowrap; }
            .custom-matrix th { background-color: #333; color: white; text-align: center; font-weight: bold; position: sticky; top: 0; z-index: 2; }
            .custom-matrix td.text-left { text-align: left; }
            .custom-matrix tr.subtotal { background-color: #f5f5f5; font-weight: bold; }
            .fill-good { background-color: #a8e6a8; }
            .fill-warn { background-color: #ffe4b5; }
            .fill-bad { background-color: #fbbbbb; }
        `;
        document.head.appendChild(style);
    },

    updateAsync: function(data, element, config, queryResponse, details, done) {
        this.container.innerHTML = ""; 

        try {
            const dimensions = queryResponse.fields.dimension_like;
            const measures = queryResponse.fields.measure_like;
            const pivots = queryResponse.fields.pivots || [];

            if (dimensions.length < 1) throw new Error("Requires at least 1 Dimension.");
            if (measures.length === 0) throw new Error("Requires at least 1 Measure.");

            // Handle pivoted vs non-pivoted gracefully
            let pivotKeys = pivots.length > 0 ? pivots.map(p => p.key) : ["_NO_PIVOT_"];

            // 1. DYNAMIC TREE BUILDER
            // We create a "Root" node that will hold all levels dynamically
            const tree = { name: "Root", level: -1, subtotals: {}, children: {} };

            data.forEach(row => {
                let currentNode = tree;

                // Extract all measure values for this specific row
                let rowValues = {};
                pivotKeys.forEach(pKey => {
                    measures.forEach(m => {
                        let val = 0;
                        if (pKey === "_NO_PIVOT_") {
                            val = row[m.name].value || 0;
                        } else {
                            let measureData = row[m.name];
                            val = (measureData && measureData[pKey]) ? (measureData[pKey].value || 0) : 0;
                        }
                        rowValues[`${pKey}_${m.name}`] = val;
                    });
                });

                // Traverse the dimensions and build the nested tree
                dimensions.forEach((dim, index) => {
                    let cell = row[dim.name];
                    let dimValue = cell.rendered || (cell.value !== null ? String(cell.value) : "Unknown");

                    if (!currentNode.children[dimValue]) {
                        currentNode.children[dimValue] = {
                            name: dimValue,
                            level: index, // Keeps track of depth (0=Country, 1=State, 2=City, etc.)
                            subtotals: {},
                            children: {},
                            isLeaf: (index === dimensions.length - 1)
                        };
                    }

                    currentNode = currentNode.children[dimValue];

                    // Add this row's values to the subtotal of every level we pass through!
                    Object.keys(rowValues).forEach(key => {
                        currentNode.subtotals[key] = (currentNode.subtotals[key] || 0) + rowValues[key];
                    });
                    
                    if (currentNode.isLeaf) {
                        currentNode.values = rowValues;
                    }
                });
            });

            // 2. RENDER HTML TABLE
            const table = document.createElement('table');
            table.className = "custom-matrix";

            // Build Header (Combines all dimension names)
            let dimHeaders = dimensions.map(d => d.label_short).join(" &#10148; ");
            let thead = `<thead><tr><th rowspan='2' class='text-left'>${dimHeaders}</th>`;
            let subhead = "<tr>";
            
            if (pivots.length > 0) {
                pivotKeys.forEach(pKey => {
                    thead += `<th colspan='${measures.length}'>${pKey}</th>`;
                    measures.forEach(m => { subhead += `<th>${m.label_short}</th>`; });
                });
            } else {
                measures.forEach(m => { thead += `<th rowspan='2'>${m.label_short}</th>`; });
            }
            
            thead += "</tr>" + subhead + "</tr></thead>";
            table.innerHTML = thead;

            const tbody = document.createElement('tbody');

            // 3. RECURSIVE RENDER FUNCTION
            // This function crawls the tree and draws the rows at the correct indentation
            function renderNode(node) {
                if (node.name !== "Root") {
                    // Indentation logic based on depth
                    let indent = "&nbsp;&nbsp;&nbsp;&nbsp;".repeat(node.level);
                    let rowClass = node.isLeaf ? "" : "subtotal";
                    let icon = node.isLeaf ? "" : "&#8627; ";
                    
                    // Only show subtotals if config is true OR if it's the deepest leaf node
                    if (!node.isLeaf && !config.show_subtotals) return; 

                    let tr = `<tr class='${rowClass}'><td class='text-left'>${indent}${icon}${node.name}</td>`;
                    
                    let dataToRender = node.isLeaf ? node.values : node.subtotals;

                    pivotKeys.forEach(pKey => {
                        measures.forEach(m => {
                            let val = dataToRender[`${pKey}_${m.name}`] || 0;
                            
                            let isRate = m.name.includes("rate") || m.name.includes("percent") || m.name.includes("Rate");
                            let displayVal = isRate ? (val * 100).toFixed(2) + "%" : val.toLocaleString();
                            
                            let cellClass = "";
                            if (isRate) {
                                if (val > 0.10) cellClass = "fill-good";
                                else if (val < 0.05) cellClass = "fill-bad";
                            }
                            
                            tr += `<td class='${cellClass}'>${displayVal}</td>`;
                        });
                    });
                    tr += `</tr>`;
                    tbody.innerHTML += tr;
                }

                // If this node has children, run this function on them too!
                if (node.children) {
                    Object.values(node.children).forEach(child => renderNode(child));
                }
            }

            // Kick off the rendering
            Object.values(tree.children).forEach(child => renderNode(child));

            table.appendChild(tbody);
            this.container.appendChild(table);

        } catch (error) {
            this.container.innerHTML = `<div style="color:red; padding: 20px;">
                <h3>Visualization Error</h3>
                <p>${error.message}</p>
                <p>Line: ${error.stack}</p>
            </div>`;
        }

        done();
    }
});
