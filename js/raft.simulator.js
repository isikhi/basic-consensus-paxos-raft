class RaftSimulator {
    constructor(initialNodes) {
        this.nodes = initialNodes.map(n => ({
            ...n,
            id: n.id,
            currentTerm: 0,
            votedFor: null,
            logEntries: [],
            commitIndex: 0,
            lastApplied: 0,
            state: 'follower',
            active: n.active !== false,
        }));
        this.messages = [];
        this.log = [];
        this.leaderId = null;
        this.leaderFailedStep = -1;
        this.highestTermSeen = 0;
    }

    getQuorumSize() {
        const nodeCount = this.nodes.filter(n => n.active).length;
        return Math.floor(nodeCount / 2) + 1;
    }

    getLeader() {
        const leaderNode = this.nodes.find(n => n.id === this.leaderId);
        if (leaderNode && leaderNode.active) {
            return leaderNode;
        }
        if (leaderNode && !leaderNode.active) {
            this.leaderId = null;
        }
        return null;
    }

    updateHighestTermSeen() {
        this.highestTermSeen = this.nodes.reduce((maxTerm, node) => {
            return node.active && node.currentTerm > maxTerm ? node.currentTerm : maxTerm;
        }, this.highestTermSeen);
    }

    simulateStep(step, scenario = "normal") {
        this.messages = [];
        let structuredLogs = [];
        this.updateHighestTermSeen();

        let leaderBeforeCheck = this.getLeader();
        if (scenario === 'leaderFailure' && step === 4 && leaderBeforeCheck && this.leaderFailedStep < 0) {
            structuredLogs.push({ 
                logKey: 'raftLeaderFailed', 
                params: { step: step, leaderId: leaderBeforeCheck.id } 
            });
            leaderBeforeCheck.state = 'failed';
            leaderBeforeCheck.active = false;
            this.leaderId = null;
            this.leaderFailedStep = step;
        }

        this.nodes.forEach(n => {
            if (step === 0) {
                n.state = 'follower';
                n.currentTerm = 0;
                n.votedFor = null;
                n.logEntries = [];
                n.commitIndex = 0;
                n.lastApplied = 0;
                if (!n.active && scenario !== 'nodeFailure') n.active = true;
            }
            if (n.state === 'candidate' && step > 1) {

            }
        });
        if (step === 0) {
            this.leaderId = null;
            this.leaderFailedStep = -1;
            this.highestTermSeen = 0;
        }

        const currentLeader = this.getLeader();

        switch (step) {
            case 1:
                {
                    if (currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftLeaderExists', 
                            params: { step: step, leaderId: currentLeader.id, term: currentLeader.currentTerm } 
                        });
                        break;
                    }
                    const initialCandidate = this.nodes.find(n => n.id === 1 && n.active);
                    if (initialCandidate) {
                        initialCandidate.state = 'candidate';
                        initialCandidate.currentTerm = this.highestTermSeen + 1;
                        this.highestTermSeen = initialCandidate.currentTerm;
                        initialCandidate.votedFor = initialCandidate.id;
                        structuredLogs.push({ 
                            logKey: 'raftCandidateElectedSelf', 
                            params: { step: step, nodeId: initialCandidate.id, term: initialCandidate.currentTerm } 
                        });
                    } else {
                        structuredLogs.push({ 
                            logKey: 'raftInitialCandidateInactive', 
                            params: { step: step, nodeId: 1 }
                        });
                    }
                    break;
                }
            case 5:
                {
                    if (currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftLeaderSendsHeartbeats', 
                            params: { step: step, leaderId: currentLeader.id, term: currentLeader.currentTerm } 
                        });
                        let targets = 0;
                        this.nodes.forEach(n => {
                            if (n.id !== currentLeader.id && n.active) {
                                targets++;
                                this.messages.push({ id: `hb-${n.id}-${step}`, from: currentLeader.id, to: n.id, type: 'appendEntries', content: `AppendEntries(term=${currentLeader.currentTerm}, entries=[])`, step });
                            }
                        });
                        if (targets > 0) structuredLogs.push({ 
                            logKey: 'raftLeaderSentHeartbeatsCount', 
                            params: { step: step, leaderId: currentLeader.id, count: targets } 
                        });
                        else structuredLogs.push({ 
                            logKey: 'raftLeaderNoFollowers', 
                            params: { step: step, leaderId: currentLeader.id } 
                        });
                        break;
                    }

                    if (!currentLeader && this.leaderFailedStep > 0) {
                        let recoveryCandidate = null;
                        const followers = this.nodes.filter(n => n.active && n.state === 'follower').sort((a, b) => a.id - b.id);
                        if (followers.length > 0) {
                            recoveryCandidate = followers[0];
                        }

                        if (recoveryCandidate) {
                            recoveryCandidate.state = 'candidate';
                            recoveryCandidate.currentTerm = this.highestTermSeen + 1;
                            this.highestTermSeen = recoveryCandidate.currentTerm;
                            recoveryCandidate.votedFor = recoveryCandidate.id;
                            structuredLogs.push({ 
                                logKey: 'raftRecoveryCandidateElectedSelf', 
                                params: { step: step, nodeId: recoveryCandidate.id, term: recoveryCandidate.currentTerm } 
                            });
                        } else {
                            structuredLogs.push({ 
                                logKey: 'raftRecoveryNoFollowers', 
                                params: { step: step } 
                            });
                        }
                    } else if (!currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftNoLeaderWaiting', 
                            params: { step: step } 
                        });
                    }
                    break;
                }

            case 2:
            case 6:
                {
                    const candidate = this.nodes.find(n => n.state === 'candidate' && n.active);
                    if (candidate) {
                        let targets = 0;
                        this.nodes.forEach(n => {
                            if (n.id !== candidate.id && n.active) {
                                targets++;
                                this.messages.push({ id: `rv-${candidate.id}-to-${n.id}-${step}`, from: candidate.id, to: n.id, type: 'requestVote', content: `RequestVote(term=${candidate.currentTerm})`, step });
                            }
                        });
                        if (targets > 0) {
                            structuredLogs.push({ 
                                logKey: 'raftCandidateRequestingVotes', 
                                params: { step: step, candidateId: candidate.id, term: candidate.currentTerm, count: targets } 
                            });
                        } else {
                            structuredLogs.push({ 
                                logKey: 'raftCandidateNoNodesToRequest', 
                                params: { step: step, candidateId: candidate.id, term: candidate.currentTerm } 
                            });
                        }
                    } else if (currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftLeaderExistsNoRequestVote', 
                            params: { step: step, leaderId: currentLeader.id } 
                        });
                    } else if (this.leaderFailedStep > 0 && step === 6) {
                        structuredLogs.push({ 
                            logKey: 'raftRecoveryNoCandidate', 
                            params: { step: step } 
                        });
                    } else {
                        structuredLogs.push({ 
                            logKey: 'raftNoCandidateWaiting', 
                            params: { step: step } 
                        });
                    }
                    break;
                }
            case 3:
            case 7:
                {
                    const requestStep = (step === 3) ? 2 : 6;
                    const requestVoteMessages = nodeStates.raft.messages.filter(m => m.type === 'requestVote' && m.step === requestStep);
                    let votesGrantedDetails = {};
                    structuredLogs.push({ logKey: 'raftProcessingRequestVotes', params: { step: step, prevStep: requestStep } });

                    requestVoteMessages.forEach(msg => {
                        const candidateId = msg.from;
                        const targetNodeId = msg.to;
                        const candidateTerm = parseInt(msg.content.match(/term=(\d+)/)?.[1] ?? 0);
                        const candidateNode = this.nodes.find(n => n.id === candidateId);
                        const voterNode = this.nodes.find(n => n.id === targetNodeId);

                        if (!voterNode || !voterNode.active) {
                            structuredLogs.push({ logKey: 'raftVoterInactive', params: { step: step, voterId: targetNodeId, candidateId: candidateId } });
                            return;
                        }
                        if (!candidateNode) {
                            structuredLogs.push({ 
                                logKey: 'raftCandidateNotFound', 
                                params: { step: step, candidateId: candidateId } 
                            });
                            return;
                        }


                        if (!(candidateId in votesGrantedDetails)) {
                            const cand = this.nodes.find(n => n.id === candidateId && n.state === 'candidate' && n.votedFor === candidateId && n.active);
                            votesGrantedDetails[candidateId] = cand ? 1 : 0;
                        }

                        let grant = false;
                        let reasonKey = 'raftVoteDeniedReasonGeneric';
                        let reasonParams = {};

                        if (voterNode.currentTerm > candidateTerm) {
                            grant = false;
                            reasonKey = 'raftVoteDeniedReasonHigherTerm';
                            reasonParams = { voterTerm: voterNode.currentTerm, candidateTerm: candidateTerm };
                        }
                        else if (candidateTerm > voterNode.currentTerm) {
                            structuredLogs.push({ 
                                logKey: 'raftVoterUpdatingTerm', 
                                params: { step: step, voterId: voterNode.id, newTerm: candidateTerm, candidateId: candidateId, oldTerm: voterNode.currentTerm } 
                            });
                            voterNode.currentTerm = candidateTerm;
                            voterNode.state = 'follower';
                            voterNode.votedFor = null;
                            grant = true;
                            voterNode.votedFor = candidateId;

                        }
                        else if (candidateTerm === voterNode.currentTerm) {
                            if (voterNode.votedFor === null || voterNode.votedFor === candidateId) {
                                grant = true;
                                voterNode.votedFor = candidateId;
                            } else {
                                grant = false;
                                reasonKey = 'raftVoteDeniedReasonAlreadyVoted';
                                reasonParams = { term: voterNode.currentTerm, votedFor: voterNode.votedFor };
                            }
                        }

                        this.messages.push({
                            id: `vg-${voterNode.id}-to-${candidateId}-${step}`,
                            from: voterNode.id,
                            to: candidateId,
                            type: 'voteGranted',
                            content: `VoteGranted(term=${voterNode.currentTerm}, granted=${grant})`,
                            step
                        });

                        if (grant) {
                            structuredLogs.push({ 
                                logKey: 'raftVoteGranted', 
                                params: { step: step, voterId: voterNode.id, candidateId: candidateId, term: voterNode.currentTerm } 
                            });
                            votesGrantedDetails[candidateId] = (votesGrantedDetails[candidateId] || 0) + 1;
                        } else {
                            structuredLogs.push({ 
                                logKey: 'raftVoteDenied', 
                                params: { 
                                    step: step, 
                                    voterId: voterNode.id, 
                                    candidateId: candidateId, 
                                    reasonKey: reasonKey, 
                                    reasonParams: reasonParams 
                                } 
                            });
                        }
                    });

                    Object.keys(votesGrantedDetails).forEach(cId => {
                        const count = votesGrantedDetails[cId];
                        const candNode = this.nodes.find(n => n.id === parseInt(cId));
                        if (candNode && candNode.state === 'candidate') {
                            structuredLogs.push({ 
                                logKey: 'raftCandidateVoteSummary', 
                                params: { step: step, candidateId: cId, term: candNode.currentTerm, count: count } 
                            });
                        }
                    });

                    if (requestVoteMessages.length === 0 && !currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftNoRequestVotesFound', 
                            params: { step: step, prevStep: requestStep } 
                        });
                    } else if (currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftLeaderExistsVoteGrantSkipped', 
                            params: { step: step, leaderId: currentLeader.id } 
                        });
                    }
                    break;
                }
            case 4:
            case 8:
                {
                    const voteStep = (step === 4) ? 3 : 7;
                    const candidatesThisTerm = this.nodes.filter(n => n.state === 'candidate' && n.active && n.currentTerm === this.highestTermSeen);
                    let newLeaderElected = false;
                    const quorum = this.getQuorumSize();
                    structuredLogs.push({ 
                        logKey: 'raftCheckingQuorum', 
                        params: { step: step, term: this.highestTermSeen, voteStep: voteStep, quorum: quorum } 
                    });

                    candidatesThisTerm.forEach(candidate => {
                        const votesForCandidate = nodeStates.raft.messages.filter(m =>
                            m.type === 'voteGranted' &&
                            m.to === candidate.id &&
                            m.step === voteStep &&
                            m.content.includes('granted=true')
                        ).length;

                        const selfVote = (candidate.votedFor === candidate.id) ? 1 : 0;
                        const totalVotes = votesForCandidate + selfVote;

                        structuredLogs.push({ 
                            logKey: 'raftCandidateVoteCheck', 
                            params: { step: step, candidateId: candidate.id, term: candidate.currentTerm, totalVotes: totalVotes, receivedVotes: votesForCandidate, selfVote: selfVote, quorum: quorum } 
                        });

                        if (totalVotes >= quorum && !newLeaderElected) {
                            candidate.state = 'leader';
                            this.leaderId = candidate.id;
                            this.leaderFailedStep = -1;
                            newLeaderElected = true;
                            structuredLogs.push({ 
                                logKey: 'raftNewLeaderElected', 
                                params: { step: step, leaderId: candidate.id, term: candidate.currentTerm, totalVotes: totalVotes, quorum: quorum } 
                            });

                            if (step === 8) {
                                structuredLogs.push({ 
                                    logKey: 'raftRecoveryElectionSuccess', 
                                    params: { step: step } 
                                });
                            }

                            let targets = 0;
                            this.nodes.forEach(n => {
                                if (n.id !== candidate.id && n.active) {
                                    targets++;
                                    this.messages.push({ id: `hb-${candidate.id}-to-${n.id}-init-${step}`, from: candidate.id, to: n.id, type: 'appendEntries', content: `AppendEntries(term=${candidate.currentTerm}, entries=[])`, step });
                                }
                            });
                            if (targets > 0) structuredLogs.push({ 
                                logKey: 'raftNewLeaderSendsHeartbeats', 
                                params: { step: step, leaderId: candidate.id, count: targets } 
                            });
                            else structuredLogs.push({ 
                                logKey: 'raftNewLeaderNoFollowers', 
                                params: { step: step, leaderId: candidate.id } 
                            });

                        } else if (totalVotes < quorum) {
                            structuredLogs.push({ 
                                logKey: 'raftCandidateNoQuorum', 
                                params: { step: step, candidateId: candidate.id, totalVotes: totalVotes, quorum: quorum } 
                            });
                        }
                    });

                    if (!newLeaderElected) {
                        if (currentLeader) {
                            structuredLogs.push({ 
                                logKey: 'raftLeaderFailedMaybe', 
                                params: { step: step, leaderId: currentLeader.id } 
                            });
                        } else if (candidatesThisTerm.length > 0) {
                            structuredLogs.push({ 
                                logKey: 'raftNoQuorumElectionFailed', 
                                params: { step: step, term: this.highestTermSeen } 
                            });
                        } else {
                            structuredLogs.push({ 
                                logKey: 'raftNoActiveCandidatesFound', 
                                params: { step: step, term: this.highestTermSeen } 
                            });
                        }
                    }

                    if (scenario === 'leaderFailure' && step === 4 && newLeaderElected && this.leaderFailedStep < 0) {
                        const justElectedLeader = this.nodes.find(n => n.id === this.leaderId);
                        if (justElectedLeader) {
                            structuredLogs.push({ 
                                logKey: 'raftScenarioTriggerLeaderFail', 
                                params: { step: step, leaderId: justElectedLeader.id } 
                            });
                            justElectedLeader.state = 'failed';
                            justElectedLeader.active = false;
                            this.leaderId = null;
                            this.leaderFailedStep = step;
                            newLeaderElected = false;
                        }
                    }

                    break;
                }

            case 9:
            case 10:
                {
                    if (currentLeader) {
                        structuredLogs.push({ 
                            logKey: 'raftLeaderPeriodicHeartbeats', 
                            params: { step: step, leaderId: currentLeader.id, term: currentLeader.currentTerm } 
                        });
                        let targets = 0;
                        this.nodes.forEach(n => {
                            if (n.id !== currentLeader.id && n.active) {
                                targets++;
                                this.messages.push({ id: `hb-${currentLeader.id}-to-${n.id}-step${step}`, from: currentLeader.id, to: n.id, type: 'appendEntries', content: `AppendEntries(term=${currentLeader.currentTerm}, entries=[])`, step });
                            }
                        });
                        if (targets > 0) {
                            structuredLogs.push({ 
                                logKey: 'raftLeaderSentHeartbeatsCount', 
                                params: { step: step, leaderId: currentLeader.id, count: targets } 
                            });
                        } else {
                            structuredLogs.push({ 
                                logKey: 'raftLeaderNoFollowers', 
                                params: { step: step, leaderId: currentLeader.id } 
                            });
                        }

                        const heartbeatMessages = this.messages.filter(m => m.type === 'appendEntries' && m.step === step && m.from === currentLeader.id);
                        heartbeatMessages.forEach(hb => {
                            const follower = this.nodes.find(n => n.id === hb.to && n.active);
                            const leaderTerm = parseInt(hb.content.match(/term=(\d+)/)?.[1] ?? 0);
                            if (follower) {
                                if (leaderTerm < follower.currentTerm) {
                                    structuredLogs.push({ 
                                        logKey: 'raftFollowerIgnoringOldHeartbeat', 
                                        params: { step: step, followerId: follower.id, leaderId: currentLeader.id, leaderTerm: leaderTerm, followerTerm: follower.currentTerm } 
                                    });
                                } else {
                                    if (leaderTerm > follower.currentTerm) {
                                        structuredLogs.push({ 
                                            logKey: 'raftFollowerUpdatingTermFromHeartbeat', 
                                            params: { step: step, voterId: follower.id, newTerm: leaderTerm, candidateId: currentLeader.id, oldTerm: follower.currentTerm } 
                                        });
                                        follower.currentTerm = leaderTerm;
                                        follower.votedFor = null;
                                    }
                                    follower.state = 'follower';
                                    structuredLogs.push({ 
                                        logKey: 'raftFollowerReceivedHeartbeat', 
                                        params: { step: step, voterId: follower.id, leaderId: currentLeader.id, term: follower.currentTerm } 
                                    });
                                }
                            }
                        });

                    } else if (this.leaderFailedStep > 0) {
                        structuredLogs.push({ 
                            logKey: 'raftNoLeaderElectionOngoing', 
                            params: { step: step, failedStep: this.leaderFailedStep } 
                        });
                    } else {
                        structuredLogs.push({ 
                            logKey: 'raftNoLeaderElectionFailed', 
                            params: { step: step } 
                        });
                    }
                    if (step === 10) {
                        structuredLogs.push({ 
                            logKey: 'raftEndOfSimulation', 
                            params: { step: step } 
                        });
                    }
                    break;
                }

            default: {
                if (step === 0) {
                    this.resetNodes();
                } else {
                    structuredLogs.push({ 
                        logKey: 'raftWaitingNextPhase', 
                        params: { step: step } 
                    });
                }
            }
        }
        this.log.push(...structuredLogs);
        return { nodes: this.nodes, messages: this.messages, log: this.log };
    }

    resetNodes() {
        this.nodes.forEach(n => {
            n.state = 'follower';
            n.currentTerm = 0;
            n.votedFor = null;
            n.logEntries = [];
            n.commitIndex = 0;
            n.lastApplied = 0;
            n.active = true;
        });
        this.leaderId = null;
        this.leaderFailedStep = -1;
        this.highestTermSeen = 0;
    }

    reset() {
        this.resetNodes();
        this.messages = [];
        this.log = [];
    }
}
