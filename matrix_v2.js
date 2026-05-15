looker.visualization.register({
    id: "advanced_expanded_matrix_v2",
    label: "Expanded Matrix V2",
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
            .custom-matrix th, .custom-matrix td { border: 1px solid #ccc; padding: 6px; text-align: right; }
            .custom-matrix th { background-color: #333; color: white; text-align: center; font-weight: bold; }
            .custom-matrix td.text-left { text-align: left; }
            .custom-matrix tr.subtotal { background-color: #f0f0f0; font-weight: bold; }
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

            // Validation
            if (dimensions.length < 2) throw new Error("Requires at least 2 Dimensions.");
            if (measures.length === 0) throw new Error("Requires at least 1 Measure.");

            const hierarchy = {};
            
            // Safely get pivot keys
            let pivotKeys = pivots.length > 0 ? pivots.map(p => p.key) : [];

            // 1. Build Data Hierarchy
            data.forEach(row => {
                // Safely extract cell values (Fallback to 'Unknown' if null)
                let dim1Cell = row[dimensions[0].name];
                let dim2Cell = row[dimensions[1].name];
                
                let dim1 = dim1Cell.rendered || (dim1Cell.value !== null ? String(dim1Cell.value) : "Unknown");
                let dim2 = dim2Cell.rendered || (dim2Cell.value !== null ? String(dim2Cell.value) : "Unknown");

                if (!hierarchy[dim1]) hierarchy[dim1] = { rows: [], subtotals: {} };
                
                let rowData = { name: dim2, values: {} };

                if (pivotKeys.length > 0) {
                    pivotKeys.forEach(pKey => {
                        measures.forEach(m => {
                            // Safely extract measure values across pivots
                            let measureData = row[m.name];
                            let val = (measureData && measureData[pKey]) ? (measureData[pKey].value || 0) : 0;
                            
                            rowData.values[`${pKey}_${m.name}`] = val;
                            hierarchy[dim1].subtotals[`${pKey}_${m.name}`] = (hierarchy[dim1].subtotals[`${pKey}_${m.name}`] || 0) + val;
                        });
                    });
                }
                hierarchy[dim1].rows.push(rowData);
            });

            // 2. Render Table
            const table = document.createElement('table');
            table.className = "custom-matrix";

            // Build Headers
            let thead = `<thead><tr><th rowspan='2' class='text-left'>${dimensions[0].label_short} / ${dimensions[1].label_short}</th>`;
            let subhead = "<tr>";
            
            if (pivotKeys.length > 0) {
                pivotKeys.forEach(pKey => {
                    thead += `<th colspan='${measures.length}'>${pKey}</th>`;
                    measures.forEach(m => { subhead += `<th>${m.label_short}</th>`; });
                });
            }
            thead += "</tr>" + subhead + "</tr></thead>";
            table.innerHTML = thead;

            // Build Body
            const tbody = document.createElement('tbody');
            
            Object.keys(hierarchy).forEach(parentDim => {
                // Parent Subtotal Row
                if (config.show_subtotals) {
                    let subRow = `<tr class='subtotal'><td class='text-left'>&#8627; <b>${parentDim}</b></td>`;
                    if (pivotKeys.length > 0) {
                        pivotKeys.forEach(pKey => {
                            measures.forEach(m => {
                                let val = hierarchy[parentDim].subtotals[`${pKey}_${m.name}`] || 0;
                                
                                // Format as percentage if the measure is a rate
                                let displayVal = m.name.includes("rate") || m.name.includes("percent") 
                                    ? (val * 100).toFixed(2) + "%" 
                                    : val.toLocaleString();
                                    
                                subRow += `<td>${displayVal}</td>`;
                            });
                        });
                    }
                    subRow += `</tr>`;
                    tbody.innerHTML += subRow;
                }

                // Child Rows
                hierarchy[parentDim].rows.forEach(childDim => {
                    let pRow = `<tr><td class='text-left'>&nbsp;&nbsp;&nbsp;&nbsp;${childDim.name}</td>`;
                    if (pivotKeys.length > 0) {
                        pivotKeys.forEach(pKey => {
                            measures.forEach(m => {
                                let val = childDim.values[`${pKey}_${m.name}`];
                                
                                // Format as percentage if the measure is a rate
                                let isRate = m.name.includes("rate") || m.name.includes("percent");
                                let displayVal = isRate ? (val * 100).toFixed(2) + "%" : val.toLocaleString();
                                
                                // Color logic
                                let cellClass = "";
                                if (isRate) {
                                    if (val > 0.10) cellClass = "fill-good";
                                    else if (val < 0.05) cellClass = "fill-bad";
                                }
                                
                                pRow += `<td class='${cellClass}'>${displayVal}</td>`;
                            });
                        });
                    }
                    pRow += `</tr>`;
                    tbody.innerHTML += pRow;
                });
            });

            table.appendChild(tbody);
            this.container.appendChild(table);

        } catch (error) {
            // IF ANYTHING FAILS, SHOW THE ERROR ON SCREEN!
            this.container.innerHTML = `<div style="color:red; padding: 20px;">
                <h3>Visualization Error</h3>
                <p>${error.message}</p>
            </div>`;
        }

        done();
    }
});
