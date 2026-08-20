# Glossary

- **Plate** — one thin-layer chromatography plate. Synonym in filenames and casual speech: "gel". One Photo shows exactly one Plate.
- **Photo** — the raw camera image of a Plate (fluorescent background under UV, dark absorbing bands).
- **Lane** — one vertical track on a Plate where a single sample or standard was spotted and developed.
- **Sample Lane** — a Lane carrying a biological sample. Labelled with a free-text Lane Label (e.g. "G", "Lo 3").
- **Standard Lane** — a Lane carrying a known amount of every Compound of interest. The Standard Lanes together form the Dilution Series.
- **Lane Label** — free text attached to a Lane by the Operator. No structure imposed by the tool.
- **Band** — one dark spot in one Lane: the signal of one Compound in that Lane's sample.
- **Compound** — a named isoflavone of interest. Names are supplied by the Operator per Plate (configuration or interactively). A Plate typically shows two or three Compounds.
- **Compound Row** — all Bands of one Compound across the Lanes of a Plate. Because of Warp, a Compound Row is a curve, not a horizontal line.
- **Warp** — the smooth vertical drift of Compound Rows across a Plate (solvent-front distortion). Rows on the same Plate share the drift's shape but warp by different amounts — drift grows with migration distance, so a row near the solvent front curves more than one near the origin. Warp is modelled so Bands can be assigned to the correct Compound; it is not itself a quantity of interest.
- **Dilution Series** — the Operator-specified amounts of each Compound in the Standard Lanes (e.g. 0.25, 0.5, 1, 1.5, 2, 3, 4 of some unit). Units are recorded as a label, not interpreted.
- **Calibration Curve** — per Compound, the fitted relationship between Band intensity and amount, derived from that Compound's Bands in the Standard Lanes. Used to convert Sample Lane Band intensities to calibrated quantities.
- **Analysis File** — a saved, reloadable record of everything the Operator did to one Plate (labels, band positions, corrections) plus the results. Also the provenance record.
- **Operator** — the scientist using the tool. Not a developer; works in a browser.
