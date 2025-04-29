function updateLanguage(lang) {
    document.documentElement.lang = lang;
    const elements = document.querySelectorAll('[data-lang-key]');
    elements.forEach(el => {
        const key = el.getAttribute('data-lang-key');
        if (langData[lang] && langData[lang][key]) {
            if (['overviewIntro', 'paxosRoles', 'paxosProtocol', 'paxosLeadership', 'paxosComplexity', 'raftRoles', 'raftProtocol', 'raftLeadership', 'raftUnderstandability', 'disclaimerText'].includes(key)
                || key.startsWith('legend')
                || key === 'glossaryP1Pn'
                || key === 'glossaryR1Rn'
                || key === 'glossaryT0Tn'
                || key === 'glossaryProposer'
                || key === 'glossaryAcceptor'
                || key === 'glossaryLearner'
                || key === 'glossaryFollower'
                || key === 'glossaryCandidate'
                || key === 'glossaryLeader'
                || key === 'glossaryPrepare'
                || key === 'glossaryPromise'
                || key === 'glossaryAccept'
                || key === 'glossaryAccepted'
                || key === 'glossaryRequestVote'
                || key === 'glossaryVoteGranted'
                || key === 'glossaryAppendEntries'
                || key === 'glossaryTerm'
            ) {
                el.innerHTML = langData[lang][key];
            } else {
                el.textContent = langData[lang][key];
            }
        } else {
            const isAdvDisadv = key.startsWith('paxosAdv') || key.startsWith('paxosDisadv') || key.startsWith('raftAdv') || key.startsWith('raftDisadv');
            const isLegend = key.startsWith('legend');
            const isGlossaryDef = key.startsWith('glossary') && !['glossaryTitle', 'glossaryNodeIdTitle', 'glossaryTermIdTitle', 'glossaryPaxosRolesTitle', 'glossaryRaftRolesTitle', 'glossaryPaxosMessagesTitle', 'glossaryRaftMessagesTitle'].includes(key);

            if (!isAdvDisadv && !isLegend && !isGlossaryDef) {
                console.warn(`Missing translation for key "${key}" in language "${lang}"`);
            }
        }
    });

    const updateListItems = (listSelector, lang) => {
        const list = document.querySelector(listSelector);
        if (list) {
            const items = list.querySelectorAll('li[data-lang-key]');
            items.forEach(item => {
                const key = item.getAttribute('data-lang-key');
                if (langData[lang] && langData[lang][key]) {
                    item.innerHTML = langData[lang][key];
                } else {
                    console.warn(`Missing translation for list item key "${key}" in language "${lang}"`);
                }
            });
        }
    };

    updateListItems('#tab-comparison .grid > div:nth-child(1) ul:nth-of-type(1)', lang);
    updateListItems('#tab-comparison .grid > div:nth-child(1) ul:nth-of-type(2)', lang);
    updateListItems('#tab-comparison .grid > div:nth-child(2) ul:nth-of-type(1)', lang);
    updateListItems('#tab-comparison .grid > div:nth-child(2) ul:nth-of-type(2)', lang);


    const scenarioSelect = document.getElementById('scenario-select');
    if (scenarioSelect) {
        scenarioSelect.options[0].textContent = langData[lang]?.scenarioNormal || 'Normal Operation';
        scenarioSelect.options[1].textContent = langData[lang]?.scenarioNodeFailure || 'Node Failure (Basic)';
        scenarioSelect.options[2].textContent = langData[lang]?.scenarioLeaderFailure || 'Leader/Proposer Failure (Recovery Attempt)';
    }

    document.getElementById("prev-step").title = lang === 'tr' ? 'Önceki Adım' : 'Previous Step';
    document.getElementById("next-step").title = lang === 'tr' ? 'Sonraki Adım' : 'Next Step';
    document.getElementById("reset-btn").title = lang === 'tr' ? 'Simülasyonu Sıfırla' : 'Reset Simulation';
}
