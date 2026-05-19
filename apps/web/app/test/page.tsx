// app/test/page.tsx
'use client';

import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RotateCcw } from 'lucide-react';
import { AgentNode } from '../../components/nodes/agentNodes';
import '../events.css';

const nodeTypes = {
    agent: AgentNode,
};

export default function AgentFlowCanvas() {
    const initialNodes: Node[] = useMemo(() => [
        { 
            id: 'planner', 
            type: 'agent', 
            position: { x: 100, y: 250 }, 
            data: { 
                agentType: 'Planner', 
                status: 'Done', 
                content: { 
                    mainText: 'Add GET/PATCH routes in src/index.ts with JWT auth, Zo...', 
                    tags: ['index.ts', 'userSchema.ts', 'routes.ts'],
                    usedTools: ['list_files', 'get_issue']
                } 
            } 
        },
        { 
            id: 'coder', 
            type: 'agent', 
            position: { x: 600, y: 250 }, 
            data: { 
                agentType: 'Coder', 
                status: 'Active', 
                attempt: 2, 
                content: { 
                    mainText: 'Implementing JWT verific...', 
                    tools: ['commit_file'],
                    usedTools: ['read_file', 'create_branch'],
                    logs: [
                        { id: '1', text: 'Analyzing index.ts' },
                        { id: '2', text: 'Reading authentication requirements' },
                        { id: '3', text: 'Calling tool: read_file' },
                        { id: '4', text: 'Calling tool: commit_file' }
                    ]
                }
            } 
        },
        { 
            id: 'reviewer', 
            type: 'agent', 
            position: { x: 1100, y: 250 }, 
            data: { 
                agentType: 'Reviewer', 
                status: 'Waiting', 
                content: { 
                    mainText: 'Reviews diff · approves or rejects' 
                }
            } 
        },
        { 
            id: 'deployer', 
            type: 'agent', 
            position: { x: 1600, y: 250 }, 
            data: { 
                agentType: 'Deployer', 
                status: 'Waiting', 
                content: { 
                    mainText: 'Opens PR · merges · closes Linear issue' 
                } 
            } 
        },
    ], []);

    const initialEdges: Edge[] = useMemo(() => [
        {
            id: 'e-planner-coder',
            source: 'planner',
            target: 'coder',
            style: { stroke: '#22c55e', strokeWidth: 3 },
        },
        {
            id: 'e-coder-reviewer',
            source: 'coder',
            target: 'reviewer',
            animated: true,
            style: { stroke: '#3b82f6', strokeWidth: 3 },
        },
        {
            id: 'e-reviewer-deployer',
            source: 'reviewer',
            target: 'deployer',
            style: { stroke: '#3f3f46', strokeWidth: 3 },
        },
    ], []);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
    const [isRestarting, setIsRestarting] = React.useState(false);

    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const handleRestartMock = () => {
        setIsRestarting(true);
        setTimeout(() => {
            setIsRestarting(false);
        }, 1500);
    };

    if (!mounted) {
        return <div className="eventsContainer" style={{ backgroundColor: '#09090b', height: '100vh' }} />;
    }

    return (
        <div className="eventsContainer" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
            <header className="header" style={{ padding: '24px 40px 0 40px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div style={{ textAlign: 'left' }}>
                    <h1 style={{ margin: 0 }}>Autonomous Agent Flow</h1>
                    <p style={{ margin: '4px 0 0 0', color: '#a3a3a3' }}>Job ID: mock-test-uuid</p>
                </div>
                <button
                    onClick={handleRestartMock}
                    disabled={isRestarting}
                    className="restart-btn"
                >
                    <RotateCcw className={isRestarting ? "animate-spin" : ""} style={{ width: '16px', height: '16px' }} />
                    <span>{isRestarting ? 'Restarting...' : 'Restart Flow'}</span>
                </button>
            </header>

            <div style={{ flexGrow: 1, position: 'relative', width: '100%', height: '100%' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    className="react-flow-dark"
                >
                    <Background color="#27272a" variant={BackgroundVariant.Dots} size={1.5} gap={24} />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
}