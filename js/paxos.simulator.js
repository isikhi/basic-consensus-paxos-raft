class PaxosSimulator {
    constructor(initialNodes) {
        this.nodes = initialNodes.map(n => ({
            ...n,
            id: n.id,
            type: n.type,
            highestPromisedN: 0,
            acceptedN: 0,
            acceptedValue: null,
            active: n.active !== false,
            isActingProposer: n.type === 'proposer'
        }));
        this.messages = [];
        this.log = [];
        this.messageHistory = [];
        this.currentProposalNumber = 0;
        this.originalProposerId = initialNodes.find(n => n.type === 'proposer')?.id || null;
        this.proposerFailedStep = -1;
    }

    getQuorumSize() {
        const acceptorCount = this.nodes.filter(n => n.type === 'acceptor' && n.active).length;
        return Math.floor(acceptorCount / 2) + 1;
    }

    getActingProposer(scenario) {
        if (scenario === 'leaderFailure') {
            const originalProposer = this.nodes.find(n => n.id === this.originalProposerId);
            if (originalProposer && !originalProposer.active) {
                const newProposer = this.nodes.find(n => n.id !== this.originalProposerId && n.type !== 'learner' && n.active);
                this.nodes.forEach(n => n.isActingProposer = (n.id === newProposer?.id));
                return newProposer;
            }
        }
        const currentProposer = this.nodes.find(n => n.isActingProposer && n.active);
        return currentProposer;
    }


    simulateStep(step, scenario = "normal") {
        this.messages = [];
        let structuredLogs = [];

        const originalProposer = this.nodes.find(n => n.id === this.originalProposerId);
        if (scenario === 'leaderFailure' && step === 3 && originalProposer && originalProposer.active && this.proposerFailedStep < 0) {
            originalProposer.state = 'failed';
            originalProposer.active = false;
            originalProposer.isActingProposer = false;
            this.proposerFailedStep = step;
            structuredLogs.push({ 
                logKey: 'paxosProposerFailed', 
                params: { step: step, proposerId: originalProposer.id } 
            });
        }

        const proposer = this.getActingProposer(scenario);
        const acceptors = this.nodes.filter(n => n.type === 'acceptor' && n.active);
        const learner = this.nodes.find(n => n.type === 'learner' && n.active);
        const quorum = this.getQuorumSize();

        this.nodes.forEach(n => {
            if (step === 0) {
                n.state = 'idle';
                n.highestPromisedN = 0;
                n.acceptedN = 0;
                n.acceptedValue = null;
                n.isActingProposer = (originalProposer && n.id === originalProposer.id);
                if (!n.active && scenario !== 'nodeFailure') n.active = true;
            }
        });
        if (step === 0) this.proposerFailedStep = -1;

        if (scenario === 'leaderFailure' && this.proposerFailedStep > 0 && !proposer && step >= this.proposerFailedStep + 2) {
            let newProposer = this.nodes.find(n => n.id !== this.originalProposerId && n.type === 'acceptor' && n.active);
            if (newProposer && !newProposer.isActingProposer) {
                newProposer.isActingProposer = true;
                structuredLogs.push({ 
                    logKey: 'paxosRecoveryProposerTakingOver', 
                    params: { step: step, proposerId: newProposer.id } 
                });
            }
        }

        const currentActingProposer = this.getActingProposer(scenario);

        switch (step) {
            case 1:
                {
                    const initialProposer = this.nodes.find(n => n.id === this.originalProposerId && n.active);
                    if (initialProposer) {
                        initialProposer.state = 'preparing';
                        initialProposer.isActingProposer = true;
                        this.currentProposalNumber += 1;
                        const proposalN = this.currentProposalNumber;
                        acceptors.forEach(n => {
                            this.messages.push({ id: `p-${n.id}`, from: initialProposer.id, to: n.id, type: 'prepare', content: `Prepare(n=${proposalN})`, step });
                        });
                        structuredLogs.push({ 
                            logKey: 'paxosPrepareSent', 
                            params: { step: step, proposerId: initialProposer.id, proposalN: proposalN, count: acceptors.length } 
                        });
                    } else if (scenario === 'leaderFailure' && this.proposerFailedStep > 0) {
                        structuredLogs.push({ 
                            logKey: 'paxosOriginalProposerFailedOrInactive', 
                            params: { step: step } 
                        });
                    } else {
                        structuredLogs.push({ 
                            logKey: 'paxosNoActiveInitialProposer', 
                            params: { step: step } 
                        });
                    }
                    break;
                }
            case 5:
                {
                    if (scenario === 'leaderFailure' && this.proposerFailedStep > 0 && currentActingProposer && currentActingProposer.id !== this.originalProposerId) {
                        currentActingProposer.state = 'preparing';
                        this.currentProposalNumber += 1;
                        const proposalN = this.currentProposalNumber;
                        acceptors.forEach(n => {
                            this.messages.push({ id: `p-rec-${n.id}`, from: currentActingProposer.id, to: n.id, type: 'prepare', content: `Prepare(n=${proposalN})`, step });
                        });
                        structuredLogs.push({ 
                            logKey: 'paxosRecoveryProposerPrepareSent', 
                            params: { step: step, proposerId: currentActingProposer.id, proposalN: proposalN, count: acceptors.length } 
                        });
                    } else if (!currentActingProposer && scenario === 'leaderFailure' && this.proposerFailedStep > 0) {
                        structuredLogs.push({ 
                            logKey: 'paxosRecoveryWaiting', 
                            params: { step: step } 
                        });
                    } else if (currentActingProposer?.id === this.originalProposerId && currentActingProposer?.active) {
                        structuredLogs.push({ 
                            logKey: 'paxosOriginalProposerActiveNoAction', 
                            params: { step: step } 
                        });
                        const learnerNode = this.nodes.find(n => n.type === 'learner' && n.active);
                        if (learnerNode) this.checkAndLearn(learnerNode, step, structuredLogs);
                    } else {
                        structuredLogs.push({ 
                            logKey: 'paxosStep5NoAction', 
                            params: { step: step } 
                        });
                        const learnerNode = this.nodes.find(n => n.type === 'learner' && n.active);
                        if (learnerNode) this.checkAndLearn(learnerNode, step, structuredLogs);
                    }
                    break;
                }

            case 2:
            case 6:
                {
                    let promisesSent = 0;
                    const prepareStep = (step === 2) ? 1 : 5;
                    const prepareMessage = this.messageHistory.slice().reverse().find(m => m.type === 'prepare' && m.step === prepareStep);
                    const incomingN = prepareMessage ? parseInt(prepareMessage.content.match(/n=(\d+)/)?.[1] ?? '0') : 0;
                    const sourceProposerId = prepareMessage?.from;

                    if (incomingN > 0 && sourceProposerId) {
                        acceptors.forEach(acceptor => {
                            if (acceptor.active && incomingN > acceptor.highestPromisedN) {
                                acceptor.state = 'promised';
                                acceptor.highestPromisedN = incomingN;
                                promisesSent++;
                                this.messages.push({ id: `pr-${acceptor.id}`, from: acceptor.id, to: sourceProposerId, type: 'promise', content: `Promise(n=${incomingN})`, step });
                            } else if (acceptor.active) {
                                structuredLogs.push({ 
                                    logKey: 'paxosAcceptorIgnoringPrepare', 
                                    params: { step: step, acceptorId: acceptor.id, proposalN: incomingN, promisedN: acceptor.highestPromisedN } 
                                });
                            }
                        });
                        if (promisesSent > 0) {
                            structuredLogs.push({ 
                                logKey: 'paxosPromisesSent', 
                                params: { step: step, count: promisesSent, proposalN: incomingN, proposerId: sourceProposerId } 
                            });
                        } else if (acceptors.length > 0) {
                            structuredLogs.push({ 
                                logKey: 'paxosNoPromisesSent', 
                                params: { step: step, proposalN: incomingN } 
                            });
                        }
                    } else {
                        structuredLogs.push({ 
                            logKey: 'paxosNoPrepareMessageFound',
                            params: { step: step, lookingForPrepareStep: prepareStep } 
                        });
                    }

                    break;
                }
            case 3:
            case 7:
                {
                    const prepareStep = (step === 3) ? 1 : 5;
                    const promiseStep = (step === 3) ? 2 : 6;
                    const prepareMessage = this.messageHistory.slice().reverse().find(m => m.type === 'prepare' && m.step === prepareStep);
                    const sourceProposerId = prepareMessage?.from;
                    const proposalN = prepareMessage ? parseInt(prepareMessage.content.match(/n=(\d+)/)?.[1] ?? '0') : 0;
                    const proposerToUpdate = currentActingProposer && currentActingProposer.id === sourceProposerId ? currentActingProposer : null;

                    let canProceed = false;
                    if (proposerToUpdate && proposalN > 0) {
                        const promisesForProposer = this.messageHistory.filter(m => m.type === 'promise' && m.to === sourceProposerId && m.step === promiseStep && m.content.includes(`n=${proposalN}`)).length;
                        if (promisesForProposer >= quorum) {
                            proposerToUpdate.state = 'promised';
                            structuredLogs.push({ 
                                logKey: 'paxosProposerGotQuorum', 
                                params: { step: step, proposerId: proposerToUpdate.id, promiseStep: promiseStep, receivedCount: promisesForProposer, quorum: quorum } 
                            });
                            canProceed = true;
                        } else {
                            proposerToUpdate.state = 'prepare_failed';
                            structuredLogs.push({ 
                                logKey: 'paxosProposerNoQuorum', 
                                params: { step: step, proposerId: proposerToUpdate.id, promiseStep: promiseStep, receivedCount: promisesForProposer, quorum: quorum } 
                            });
                            canProceed = false;
                        }
                    } else if (scenario === 'leaderFailure' && this.proposerFailedStep > 0 && step === 7) {
                        structuredLogs.push({ 
                            logKey: 'paxosRecoveryProposerFailedOrNoPrepare', 
                            params: { step: step, proposerId: sourceProposerId } 
                        });
                    } else if (!proposerToUpdate && sourceProposerId) {
                        structuredLogs.push({ 
                            logKey: 'paxosProposerInactiveOrNotFound',
                            params: { step: step, proposerId: sourceProposerId, proposalN: proposalN } 
                        });
                    } else if (!proposalN || proposalN <= 0) {
                        structuredLogs.push({ 
                            logKey: 'paxosNoValidPrepareMessageForAccept', 
                            params: { step: step, prepareStep: prepareStep } 
                        });
                    }

                    if (canProceed && proposerToUpdate) {
                        proposerToUpdate.state = 'proposing';
                        const valueToPropose = "value" + proposalN;

                        acceptors.forEach(n => {
                            if (n.active) {
                                this.messages.push({ id: `a-${n.id}`, from: proposerToUpdate.id, to: n.id, type: 'accept', content: `Accept(n=${proposalN}, v="${valueToPropose}")`, step });
                            }
                        });
                        structuredLogs.push({ 
                            logKey: 'paxosAcceptSent', 
                            params: { step: step, proposerId: proposerToUpdate.id, proposalN: proposalN, value: valueToPropose } 
                        });

                        proposerToUpdate.state = 'idle';
                        structuredLogs.push({ 
                            logKey: 'paxosProposerIdleAfterAccept', 
                            params: { step: step, proposerId: proposerToUpdate.id, proposalN: proposalN } 
                        });
                    } else if (!canProceed && proposerToUpdate) {
                        structuredLogs.push({ 
                            logKey: 'paxosCannotSendAcceptDueToNoQuorum', 
                            params: { step: step, proposerId: proposerToUpdate.id } 
                        });
                    } else if (!proposerToUpdate && canProceed) {
                        structuredLogs.push({ 
                            logKey: 'paxosErrorCannotSendAcceptProposerGone', 
                            params: { step: step, proposerId: sourceProposerId } 
                        });
                    }
                    break;
                }
            case 4:
            case 8:
                {
                    let acceptedCount = 0;
                    const acceptStep = (step === 4) ? 3 : 7;
                    const acceptMessage = this.messageHistory.slice().reverse().find(m => m.type === 'accept' && m.step === acceptStep);
                    const incomingN = acceptMessage ? parseInt(acceptMessage.content.match(/n=(\d+)/)?.[1] ?? '0') : 0;
                    const incomingV = acceptMessage ? acceptMessage.content.match(/v="([^"]+)"/)?.[1] ?? null : null;
                    const sourceProposerId = acceptMessage?.from;

                    if (incomingN > 0 && incomingV !== null && sourceProposerId) {
                        acceptors.forEach(acceptor => {
                            if (acceptor.active && incomingN >= acceptor.highestPromisedN) {
                                acceptor.state = 'accepted';
                                acceptor.acceptedN = incomingN;
                                acceptor.acceptedValue = incomingV;
                                acceptedCount++;
                                if (learner && learner.active) {
                                    this.messages.push({ id: `ac-${acceptor.id}`, from: acceptor.id, to: learner.id, type: 'accepted', content: `Accepted(n=${acceptor.acceptedN}, v="${acceptor.acceptedValue}")`, step });
                                }
                            } else if (acceptor.active) {
                                structuredLogs.push({ 
                                    logKey: 'paxosAcceptorIgnoringAccept', 
                                    params: { step: step, acceptorId: acceptor.id, proposalN: incomingN, promisedN: acceptor.highestPromisedN } 
                                });
                            }
                        });
                        if (acceptedCount > 0) {
                            structuredLogs.push({ 
                                logKey: 'paxosAcceptedAndNotified', 
                                params: { step: step, count: acceptedCount, value: incomingV, proposalN: incomingN, proposerId: sourceProposerId } 
                            });
                        } else if (acceptors.length > 0) {
                            structuredLogs.push({ 
                                logKey: 'paxosNoAcceptorsAccepted', 
                                params: { step: step, value: incomingV, proposalN: incomingN } 
                            });
                        }
                    } else {
                        structuredLogs.push({ 
                            logKey: 'paxosNoAcceptMessageFound',
                            params: { step: step, lookingForAcceptStep: acceptStep } 
                        });
                    }

                    if (learner && learner.active && learner.state !== 'learned') {
                        this.checkAndLearn(learner, step, structuredLogs);
                    }
                    break;
                }
            case 9:
            case 10:
                {
                    if (learner && learner.active) {
                        this.checkAndLearn(learner, step, structuredLogs);
                    } else {
                        structuredLogs.push({ 
                            logKey: 'paxosNoActiveLearner', 
                            params: { step: step } 
                        });
                    }
                    if (step === 10) {
                        const learnedValue = learner?.state === 'learned' ? learner.value : 'None';
                        structuredLogs.push({ 
                            logKey: 'paxosEndOfSimulation', 
                            params: { step: step, learnedValue: learnedValue } 
                        });
                    }
                    break;
                }
            default: {
                const isActiveLearnerWaiting = learner && learner.active && learner.state !== 'learned';

                if (step === 0) {
                    this.resetNodes();
                } else if (scenario === 'leaderFailure' && this.proposerFailedStep > 0 && step > this.proposerFailedStep && step < 5) {
                    structuredLogs.push({ 
                        logKey: 'paxosWaitingRecovery', 
                        params: { step: step } 
                    });
                } else if (isActiveLearnerWaiting && step > 4) {
                    this.checkAndLearn(learner, step, structuredLogs);
                    if(learner.state === 'waiting') {
                        structuredLogs.push({ 
                            logKey: 'paxosLearnerStillWaiting', 
                            params: { step: step } 
                        });
                    }
                }
                else {
                    structuredLogs.push({ 
                        logKey: 'paxosNoSpecificActionOrWaiting', 
                        params: { step: step } 
                    });
                }
            }
        }
        this.log.push(...structuredLogs);
        this.messageHistory.push(...this.messages);
        return { nodes: this.nodes, messages: this.messages, log: this.log };
    }

    checkAndLearn(learner, step, structuredLogs) {
        const acceptedMessages = this.messageHistory.filter(m => m.type === 'accepted');
        let acceptedCounts = {};
        let potentialLearnedValue = null;
        let highestNLearned = 0;

        acceptedMessages.forEach(m => {
            const msgN = parseInt(m.content.match(/n=(\d+)/)?.[1] ?? '0');
            const msgV = m.content.match(/v="([^"]+)"/)?.[1] ?? null;
            const sourceId = m.from;
            if (msgV && msgN > 0) {
                if (!acceptedCounts[msgV]) {
                    acceptedCounts[msgV] = { count: 0, highestN: 0, sources: new Set() };
                }
                if (!acceptedCounts[msgV].sources.has(sourceId)) {
                    acceptedCounts[msgV].count++;
                    acceptedCounts[msgV].sources.add(sourceId);
                }
                if (msgN > acceptedCounts[msgV].highestN) {
                    acceptedCounts[msgV].highestN = msgN;
                }
            }
        });

        const quorum = this.getQuorumSize();
        let candidateValues = [];
        for (const value in acceptedCounts) {
            const data = acceptedCounts[value];
            if (data.count >= quorum) {
                candidateValues.push({ value: value, highestN: data.highestN, count: data.count });
            }
        }

        if (candidateValues.length > 0) {
            candidateValues.sort((a, b) => b.highestN - a.highestN);
            potentialLearnedValue = candidateValues[0].value;
            highestNLearned = candidateValues[0].highestN;
            const winningCount = candidateValues[0].count;

            if (learner.state !== 'learned' || highestNLearned > learner.acceptedN) {
                const oldState = learner.state;
                const oldValue = learner.value;
                learner.state = 'learned';
                learner.value = potentialLearnedValue;
                learner.acceptedN = highestNLearned;
                structuredLogs.push({ 
                    logKey: 'paxosLearnerLearned', 
                    params: { 
                        step: step, 
                        learnerId: learner.id, 
                        value: learner.value, 
                        proposalN: highestNLearned, 
                        count: winningCount,
                        quorum: quorum,
                        previousState: oldState,
                        previousValue: oldValue
                    } 
                });
            } else if (learner.state === 'learned' && potentialLearnedValue === learner.value && highestNLearned === learner.acceptedN) {
            } else if (learner.state === 'learned' && potentialLearnedValue !== learner.value) {
                structuredLogs.push({ 
                    logKey: 'paxosLearnerConflict', 
                    params: { 
                        step: step, 
                        learnerId: learner.id, 
                        currentValue: learner.value,
                        currentN: learner.acceptedN,
                        conflictingValue: potentialLearnedValue,
                        conflictingN: highestNLearned,
                        conflictingCount: winningCount,
                        quorum: quorum 
                    } 
                });
            }
        } else if (learner.state !== 'learned') {
            learner.state = 'waiting';
            if(learner.prevState !== 'waiting' || !learner.prevState) {
                structuredLogs.push({ 
                    logKey: 'paxosLearnerWaitingQuorum', 
                    params: { step: step, learnerId: learner.id, quorum: quorum, details: acceptedCounts }
                });
            }
        }
        learner.prevState = learner.state;
    }


    resetNodes() {
        const originalProposerExists = this.nodes.some(n => n.id === this.originalProposerId);
        this.nodes.forEach(n => {
            n.state = 'idle';
            n.highestPromisedN = 0;
            n.acceptedN = 0;
            n.acceptedValue = null;
            n.active = true;
            n.isActingProposer = (originalProposerExists && n.id === this.originalProposerId);
            delete n.prevState;
        });
        this.currentProposalNumber = 0;
        this.proposerFailedStep = -1;
    }

    reset() {
        this.resetNodes();
        this.messages = [];
        this.log = [];
        this.messageHistory = [];
    }
}