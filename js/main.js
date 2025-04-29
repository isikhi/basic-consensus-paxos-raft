let activeAlgorithm = 'comparison';
let scenario = "normal";
let currentStep = 0;
let maxSteps = 10;
let nodeStates = {
    paxos: { nodes: [], messages: [], log: [] },
    raft: { nodes: [], messages: [], log: [] }
};
let paxosSim, raftSim;
let paxosCy, raftCy;

const nodePositions = [
    { id: 1, x: 100, y: 100 },
    { id: 2, x: 300, y: 50 },
    { id: 3, x: 500, y: 100 },
    { id: 4, x: 300, y: 250 },
    { id: 5, x: 100, y: 200 },
];

const initialPaxosNodes = nodePositions.map(p => ({
    ...p,
    type: p.id === 1 ? 'proposer' : (p.id === 5 ? 'learner' : 'acceptor'),
    state: 'idle',
    active: true
}));

const initialRaftNodes = nodePositions.map(p => ({
    ...p,
    type: 'node',
    state: 'follower',
    active: true
}));

function formatLogMessage(logEntry, lang) {
    if (typeof logEntry !== 'object' || logEntry === null || !logEntry.logKey) {
        return String(logEntry);
    }

    const logKey = logEntry.logKey;
    const params = logEntry.params || {};

    const logTemplates = langData[lang]?.simulationLogs || langData['en']?.simulationLogs || {};
    let template = logTemplates[logKey];

    if (!template) {
        console.warn(`Log şablonu bulunamadı: Anahtar: ${logKey}, Dil: ${lang}`);
        return `[${lang.toUpperCase()}] ${logKey}: ${JSON.stringify(params)}`;
    }

    if (logKey === 'raftVoteDenied' && params.reasonKey) {
        const reasonTemplates = langData[lang]?.simulationLogs || langData['en']?.simulationLogs || {};
        let reasonTemplate = reasonTemplates[params.reasonKey];
        const reasonParams = params.reasonParams || {};
        if (reasonTemplate) {
            for (const rKey in reasonParams) {
                reasonTemplate = reasonTemplate.replace(new RegExp(`\\{${rKey}\\}`, 'g'), reasonParams[rKey]);
            }
            template = template.replace('{reason}', reasonTemplate);
        } else {
            console.warn(`Sebep şablonu bulunamadı: Anahtar: ${params.reasonKey}, Dil: ${lang}`);
            template = template.replace('{reason}', `(Sebep: ${params.reasonKey})`);
        }
    }

    for (const key in params) {
        if (logKey === 'raftVoteDenied' && (key === 'reasonKey' || key === 'reasonParams')) {
            continue;
        }
        template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), params[key]);
    }

    return template;
}

function initializeSimulation() {
    paxosSim = new PaxosSimulator(initialPaxosNodes.map(n => ({ ...n })));
    raftSim = new RaftSimulator(initialRaftNodes.map(n => ({ ...n })));

    nodeStates.paxos = { nodes: paxosSim.nodes, messages: [], log: [] };
    nodeStates.raft = { nodes: raftSim.nodes, messages: [], log: [] };

    currentStep = 0;
    document.getElementById("step-slider").value = currentStep;
    document.getElementById("step-slider").max = maxSteps;

    updateStepDisplay();
    updateSimulationStep(currentStep);
}

function updateSimulationStep(step) {
    let currentPaxosNodes = initialPaxosNodes.map(n => ({ ...n }));
    let currentRaftNodes = initialRaftNodes.map(n => ({ ...n }));

    if (scenario === 'nodeFailure') {
        applyScenarioStart(currentPaxosNodes, currentRaftNodes, scenario);
    }

    paxosSim = new PaxosSimulator(currentPaxosNodes);
    raftSim = new RaftSimulator(currentRaftNodes);

    let paxosHistory = [];
    let raftHistory = [];

    paxosSim.log = [];
    raftSim.log = [];

    for (let i = 1; i <= step; i++) {
        nodeStates.paxos.messages = (i > 1 && paxosHistory[i - 2]) ? paxosHistory[i - 2].messages : [];
        nodeStates.raft.messages = (i > 1 && raftHistory[i - 2]) ? raftHistory[i - 2].messages : [];

        let pRes = paxosSim.simulateStep(i, scenario);
        paxosSim.nodes = pRes.nodes;
        paxosHistory.push({ nodes: pRes.nodes, messages: pRes.messages, log: pRes.log.slice() });

        let rRes = raftSim.simulateStep(i, scenario);
        raftSim.nodes = rRes.nodes;
        raftSim.leaderId = raftSim.getLeader()?.id ?? null;
        raftHistory.push({ nodes: rRes.nodes, messages: rRes.messages, log: rRes.log.slice() });
    }

    let finalPaxosState = paxosHistory[step - 1] || { nodes: paxosSim.nodes, messages: [], log: [] };
    let finalRaftState = raftHistory[step - 1] || { nodes: raftSim.nodes, messages: [], log: [] };

    let cumulativePaxosLogs = [];
    for (let i = 0; i < step; i++) {
        if (paxosHistory[i]) cumulativePaxosLogs = paxosHistory[i].log;
    }
    let cumulativeRaftLogs = [];
    for (let i = 0; i < step; i++) {
        if (raftHistory[i]) cumulativeRaftLogs = raftHistory[i].log;
    }

    if (step === 0) {
        finalPaxosState = paxosSim.simulateStep(0, scenario);
        finalRaftState = raftSim.simulateStep(0, scenario);
        cumulativePaxosLogs = finalPaxosState.log;
        cumulativeRaftLogs = finalRaftState.log;
    }

    nodeStates.paxos = { nodes: finalPaxosState.nodes, messages: finalPaxosState.messages, log: cumulativePaxosLogs };
    nodeStates.raft = { nodes: finalRaftState.nodes, messages: finalRaftState.messages, log: cumulativeRaftLogs };

    updateCytoscape();
    updateLogsDisplay(cumulativePaxosLogs, cumulativeRaftLogs);
}

function applyScenarioStart(paxosNodes, raftNodes, scenario) {
    if (scenario === 'nodeFailure') {
        const paxosNodeToFail = paxosNodes.find(n => n.id === 4);
        if (paxosNodeToFail) paxosNodeToFail.active = false;
        const raftNodeToFail = raftNodes.find(n => n.id === 3);
        if (raftNodeToFail) raftNodeToFail.active = false;
        console.log("Applied nodeFailure scenario start: Paxos Node 4 inactive, Raft Node 3 inactive.");
    }
}

function updateLogsDisplay(paxosLogs, raftLogs) {
    const logPanel = document.getElementById("log-panel");
    logPanel.innerHTML = '';

    paxosLogs = paxosLogs || [];
    raftLogs = raftLogs || [];

    const currentLang = document.getElementById('language-select').value || 'tr';

    const baseLogTitle = langData[currentLang]?.logTitle || langData['en']?.logTitle || "Simulation Logs";
    const paxosHeader = baseLogTitle.replace(/Logları|Logs/i, 'Paxos Logları').replace(/Simulation/i, 'Paxos');
    const raftHeader = baseLogTitle.replace(/Logları|Logs/i, 'Raft Logları').replace(/Simulation/i, 'Raft');

    const paxosCol = document.createElement('div');
    paxosCol.classList.add('log-column');
    paxosCol.id = 'paxos-log-column';
    let paxosHTML = `<h5 class="text-blue-300">${paxosHeader}</h5>`;
    if (paxosLogs.length > 0) {
        paxosLogs.forEach(msg => {
            paxosHTML += `<div>${formatLogMessage(msg, currentLang)}</div>`;
        });
    }
    paxosCol.innerHTML = paxosHTML;

    const raftCol = document.createElement('div');
    raftCol.classList.add('log-column');
    raftCol.id = 'raft-log-column';
    let raftHTML = `<h5 class="text-green-300">${raftHeader}</h5>`;
    if (raftLogs.length > 0) {
        raftLogs.forEach(msg => {
            raftHTML += `<div>${formatLogMessage(msg, currentLang)}</div>`;
        });
    }
    raftCol.innerHTML = raftHTML;

    if (activeAlgorithm === "paxos") {
        raftCol.style.display = 'none';
        paxosCol.style.display = 'block';
        logPanel.appendChild(paxosCol);
    } else if (activeAlgorithm === "raft") {
        paxosCol.style.display = 'none';
        raftCol.style.display = 'block';
        logPanel.appendChild(raftCol);
    } else {
        paxosCol.style.display = 'block';
        raftCol.style.display = 'block';
        logPanel.appendChild(paxosCol);
        logPanel.appendChild(raftCol);
    }

    setTimeout(() => {
        const paxosVisible = paxosCol.style.display !== 'none';
        const raftVisible = raftCol.style.display !== 'none';

        if (paxosVisible) {
            paxosCol.scrollTop = paxosCol.scrollHeight;
        }
        if (raftVisible) {
            raftCol.scrollTop = raftCol.scrollHeight;
        }
    }, 0);
}

function updateStepDisplay() {
    document.getElementById("step-val").textContent = currentStep;
}

function initializeCytoscape() {
    const commonNodeStyle = {
        'width': '50px', 'height': '50px',
        'label': 'data(label)', 'font-size': '10px', 'color': '#000',
        'text-valign': 'center', 'text-halign': 'center',
        'text-wrap': 'wrap', 'text-max-width': '45px',
        'border-width': 1, 'border-color': '#555'
    };
    const commonEdgeStyle = {
        'width': 1.5, 'curve-style': 'bezier',
        'target-arrow-shape': 'triangle', 'target-arrow-color': '#555',
        'line-color': '#ccc',
        'label': 'data(label)', 'font-size': '9px', 'color': '#333',
        'text-background-color': '#fff', 'text-background-opacity': 0.7,
        'text-background-padding': '1px'
    };

    paxosCy = cytoscape({
        container: document.getElementById('paxos-graph'),
        elements: [],
        style: [{ selector: 'node', style: commonNodeStyle }, { selector: 'edge', style: commonEdgeStyle }],
        layout: { name: 'preset', padding: 20 }
    });

    raftCy = cytoscape({
        container: document.getElementById('raft-graph'),
        elements: [],
        style: [{ selector: 'node', style: commonNodeStyle }, { selector: 'edge', style: commonEdgeStyle }],
        layout: { name: 'preset', padding: 20 }
    });
}

function updateCytoscape() {
    const nodeStyles = {
        proposer: { 'background-color': '#a7d7f9', 'shape': 'diamond' },
        acceptor: { 'background-color': '#ffffcc', 'shape': 'ellipse' },
        learner: { 'background-color': '#c1e1c1', 'shape': 'triangle' },
        preparing: { 'border-width': 3, 'border-color': '#007bff' },
        promised: { 'border-width': 3, 'border-color': '#ffc107' },
        proposing: { 'border-width': 3, 'border-color': '#007bff', 'border-style': 'dashed' },
        accepted: { 'border-width': 3, 'border-color': '#28a745' },
        learned: { 'background-color': '#28a745', 'border-width': 3, 'border-color': 'black' },
        prepare_failed: { 'border-width': 3, 'border-color': '#dc3545', 'border-style': 'dotted' },
        leader: { 'background-color': '#a0d9a1', 'border-width': 3, 'border-color': 'black', 'shape': 'star' },
        candidate: { 'background-color': '#ffdca8', 'border-width': 3, 'border-color': '#fd7e14' },
        follower: { 'background-color': '#e9ecef', 'shape': 'ellipse' },
        failed: { 'background-color': '#f8d7da', 'opacity': 0.6, 'border-width': 2, 'border-color': '#dc3545', 'border-style': 'dashed' },
        idle: { 'background-color': '#f8f9fa' }
    };

    const edgeStyles = {
        prepare: { 'line-color': '#007bff', 'target-arrow-color': '#007bff' },
        promise: { 'line-color': '#ffc107', 'target-arrow-color': '#ffc107', 'line-style': 'dashed' },
        accept: { 'line-color': '#007bff', 'target-arrow-color': '#007bff', 'width': 2.5 },
        accepted: { 'line-color': '#28a745', 'target-arrow-color': '#28a745', 'line-style': 'dashed', 'width': 2.5 },
        requestVote: { 'line-color': '#fd7e14', 'target-arrow-color': '#fd7e14' },
        voteGranted: { 'line-color': '#20c997', 'target-arrow-color': '#20c997', 'line-style': 'dashed' },
        appendEntries: { 'line-color': '#17a2b8', 'target-arrow-color': '#17a2b8', 'width': 2.5 },
        default: { 'line-color': '#adb5bd', 'target-arrow-color': '#adb5bd', 'width': 1.5, 'line-style': 'solid' }
    };

    if (activeAlgorithm === 'paxos' || activeAlgorithm === 'comparison') {
        paxosCy.elements().remove();
        let paxosElements = [];
        (nodeStates.paxos.nodes || []).forEach(node => {
            let nodeBaseStyle = nodeStyles[node.type] || nodeStyles['idle'];
            if (node.isActingProposer && node.type !== 'proposer') {
                nodeBaseStyle = nodeStyles['proposer'];
            }
            const nodeStateStyle = nodeStyles[node.state] || {};
            const finalStyle = node.active === false ? nodeStyles['failed'] : { ...nodeBaseStyle, ...nodeStateStyle };
            let label = `P${node.id} (${node.type})\n${node.state}`;
            if (node.isActingProposer && node.type !== 'proposer' && node.active) {
                label = `P${node.id} (Acting Proposer)\n${node.state}`;
            }
            label += `${node.acceptedValue ? `\nv=${node.acceptedValue}` : ''}${node.acceptedN ? ` (n=${node.acceptedN})` : ''}`;

            paxosElements.push({
                group: 'nodes',
                data: { id: "p" + node.id, label: label, active: node.active !== false },
                position: { x: node.x, y: node.y },
                style: finalStyle
            });
        });
        (nodeStates.paxos.messages || []).forEach(message => {
            const edgeStyle = edgeStyles[message.type] || edgeStyles['default'];
            paxosElements.push({
                group: 'edges',
                data: {
                    id: "p-edge-" + message.from + "-" + message.to + "-" + message.type + Math.random(),
                    source: "p" + message.from,
                    target: "p" + message.to,
                    label: message.content.length > 20 ? message.type : message.content
                },
                style: edgeStyle
            });
        });
        paxosCy.add(paxosElements);
        paxosCy.style().update();
        paxosCy.layout({ name: 'preset', fit: true, padding: 30 }).run();
    }

    if (activeAlgorithm === 'raft' || activeAlgorithm === 'comparison') {
        raftCy.elements().remove();
        let raftElements = [];
        (nodeStates.raft.nodes || []).forEach(node => {
            const nodeStateStyle = nodeStyles[node.state] || nodeStyles['follower'];
            const finalStyle = node.active === false ? nodeStyles['failed'] : nodeStateStyle;
            raftElements.push({
                group: 'nodes',
                data: {
                    id: "r" + node.id,
                    label: `R${node.id}\n${node.active === false ? '(Failed)' : node.state}\nT=${node.currentTerm}`,
                    active: node.active !== false
                },
                position: { x: node.x, y: node.y },
                style: finalStyle
            });
        });
        (nodeStates.raft.messages || []).forEach(message => {
            const edgeStyle = edgeStyles[message.type] || edgeStyles['default'];
            raftElements.push({
                group: 'edges',
                data: {
                    id: "r-edge-" + message.from + "-" + message.to + "-" + message.type + Math.random(),
                    source: "r" + message.from,
                    target: "r" + message.to,
                    label: message.content.length > 25 ? message.type : message.content
                },
                style: edgeStyle
            });
        });
        raftCy.add(raftElements);
        raftCy.style().update();
        raftCy.layout({ name: 'preset', fit: true, padding: 30 }).run();
    }

    const paxosContainer = document.querySelector('.paxos-container');
    const raftContainer = document.querySelector('.raft-container');
    const vizArea = document.getElementById('visualization-area');

    if (activeAlgorithm === 'paxos') {
        paxosContainer.style.display = 'block';
        raftContainer.style.display = 'none';
        vizArea.classList.remove('lg:grid-cols-2');
        vizArea.classList.add('lg:grid-cols-1');
    } else if (activeAlgorithm === 'raft') {
        paxosContainer.style.display = 'none';
        raftContainer.style.display = 'block';
        vizArea.classList.remove('lg:grid-cols-2');
        vizArea.classList.add('lg:grid-cols-1');
    } else {
        paxosContainer.style.display = 'block';
        raftContainer.style.display = 'block';
        vizArea.classList.remove('lg:grid-cols-1');
        vizArea.classList.add('lg:grid-cols-2');
    }

    setTimeout(() => {
        if (paxosCy && paxosContainer.style.display !== 'none') paxosCy.resize();
        if (raftCy && raftContainer.style.display !== 'none') raftCy.resize();
    }, 50);
}

document.addEventListener("DOMContentLoaded", () => {
    const langSelect = document.getElementById('language-select');
    langSelect.addEventListener('change', (e) => {
        const selectedLang = e.target.value;
        updateLanguage(selectedLang);
        updateLogsDisplay(nodeStates.paxos.log, nodeStates.raft.log);
        if (currentStep === 0) {
            updateSimulationStep(0);
        }
    });

    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");

            tabButtons.forEach(b => b.classList.remove("tab-active", "text-gray-900"));
            tabContents.forEach(tc => tc.classList.remove("active"));

            btn.classList.add("tab-active", "text-gray-900");
            document.getElementById("tab-" + tabId).classList.add("active");

            if (tabId === 'visualization') {
                setTimeout(() => {
                    if (paxosCy) paxosCy.resize();
                    if (raftCy) raftCy.resize();
                }, 50);
            }
        });
    });

    document.getElementById("goto-visualization").addEventListener("click", () => {
        document.querySelector('.tab-btn[data-tab="visualization"]').click();
    });

    const algoButtons = document.querySelectorAll(".algo-btn");
    algoButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            activeAlgorithm = btn.getAttribute("data-algo");
            algoButtons.forEach(b => {
                b.classList.remove("bg-purple-700", "bg-blue-700", "bg-green-700", "text-white", "font-bold");
                b.classList.add("bg-gray-300", "text-gray-700");
            });
            const activeClasses = {
                'comparison': ['bg-purple-700', 'text-white', 'font-bold'],
                'paxos': ['bg-blue-700', 'text-white', 'font-bold'],
                'raft': ['bg-green-700', 'text-white', 'font-bold']
            };
            btn.classList.remove("bg-gray-300", "text-gray-700");
            btn.classList.add(...activeClasses[activeAlgorithm]);

            updateCytoscape();
            updateLogsDisplay(nodeStates.paxos.log, nodeStates.raft.log);
        });
    });

    document.getElementById("scenario-select").addEventListener("change", (e) => {
        scenario = e.target.value;
        console.log(`Scenario changed to: ${scenario}`);
        let previousStep = currentStep;
        currentStep = 0;
        updateStepDisplay();

        initializeSimulation();
        currentStep = previousStep;
        document.getElementById("step-slider").value = currentStep;
        updateStepDisplay();
        updateSimulationStep(currentStep);
    });

    document.getElementById("step-slider").addEventListener("input", (e) => {
        currentStep = parseInt(e.target.value);
        updateStepDisplay();
        updateSimulationStep(currentStep);
    });

    document.getElementById("next-step").addEventListener("click", () => {
        const max = parseInt(document.getElementById("step-slider").max);
        if (currentStep < max) {
            currentStep++;
            document.getElementById("step-slider").value = currentStep;
            updateStepDisplay();
            updateSimulationStep(currentStep);
        }
    });
    document.getElementById("prev-step").addEventListener("click", () => {
        if (currentStep > 0) {
            currentStep--;
            document.getElementById("step-slider").value = currentStep;
            updateStepDisplay();
            updateSimulationStep(currentStep);
        }
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
        currentStep = 0;
        scenario = "normal";
        document.getElementById("step-slider").value = currentStep;
        document.getElementById("scenario-select").value = "normal";
        updateStepDisplay();
        nodeStates.paxos.log = [];
        nodeStates.raft.log = [];
        initializeSimulation();
        updateLogsDisplay([], []);

        document.querySelector(`.algo-btn[data-algo="${activeAlgorithm}"]`).click();
    });

    initializeCytoscape();
    initializeSimulation();
    updateLanguage('tr');

    document.querySelector(`.algo-btn[data-algo="${activeAlgorithm}"]`).click();
    document.querySelector('.tab-btn[data-tab="overview"]').click();
});
