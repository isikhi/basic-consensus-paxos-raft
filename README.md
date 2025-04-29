# Paxos vs Raft Consensus Algorithm Visualizer

This project provides a simple, interactive visualization of the Paxos and Raft consensus algorithms, allowing users to
step through basic scenarios and observe the message flows and state changes involved.

Go to for webpage:
[https://isikhi.github.io/basic-consensus-paxos-raft/
](https://isikhi.github.io/basic-consensus-paxos-raft/)

## Purpose

The primary goal is to offer a conceptual understanding of how Paxos and Raft work by visualizing their core mechanics
side-by-side. It helps illustrate the fundamental differences in their approaches to achieving consensus in a
distributed system.

## Implementation Note

This visualizer is intentionally kept simple:

* **Technology:** It's built using plain JavaScript, HTML, and CSS (with Tailwind CSS for styling and Cytoscape.js for
  graph visualization). No complex frameworks or build tools were used.
* **Focus:** The emphasis is purely on visualizing the *basic* flow and concepts. The simulation logic is **highly
  simplified** and does **not** represent a complete or fully accurate implementation of either algorithm. Critical
  aspects like detailed timeout handling, full log matching rules, complex recovery procedures, dynamic proposal
  numbers, or sophisticated edge case management are omitted for clarity and rapid development.
* **Design:** The design is functional rather than elaborate, prioritizing the visualization over aesthetic details.

Think of this as a quick sketch to illustrate core ideas, not a blueprint for a good system. It was developed rapidly to
serve the primary purpose of basic conceptual visualization.
