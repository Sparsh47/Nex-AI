// app/[jobId]/page.tsx
"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { ReactFlow, Background, Controls, BackgroundVariant, useNodesState, useEdgesState, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RotateCcw } from "lucide-react";
import { AgentNode, type NodeStatus } from "../../components/nodes/agentNodes";
import "../events.css";

const nodeTypes = {
    agent: AgentNode,
};

export default function JobIdPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  
  // Real-time state
  const [activeAgent, setActiveAgent] = useState<'Planner' | 'Coder' | 'Reviewer' | 'Deployer'>('Planner');
  const [activeStatus, setActiveStatus] = useState("Initializing...");
  const [isDone, setIsDone] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  
  const [attempt, setAttempt] = useState(1);
  const [tools, setTools] = useState<string[]>([]);
  const [usedTools, setUsedTools] = useState<Record<string, string[]>>({
    Planner: [],
    Coder: [],
    Reviewer: [],
    Deployer: []
  });
  const [logs, setLogs] = useState<Record<string, Array<{ id: string; text: string }>>>({
    Planner: [],
    Coder: [],
    Reviewer: [],
    Deployer: []
  });
  const [errorText, setErrorText] = useState<string | null>(null);
  const [failureDescription, setFailureDescription] = useState<string | null>(null);

  const [plannerResult, setPlannerResult] = useState<any>(null);
  const [coderResult, setCoderResult] = useState<any>(null);
  const [reviewerResult, setReviewerResult] = useState<any>(null);
  const [deployerResult, setDeployerResult] = useState<any>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getEventDescription = (e: any) => {
    const type = e.data?.eventType;
    switch (type) {
      case 'THINKING':
        return e.data?.content || 'Strategizing...';
      case 'TOOL_CALL':
        return `Tool: ${e.data?.toolName}`;
      case 'RESULT':
        return 'Phase complete';
      case 'ERROR':
        return 'Encountered an issue';
      default:
        return 'Processing...';
    }
  };

  useEffect(() => {
    const eventSource = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/stream`,
    );

    eventSource.onmessage = (event) => {
      if (!event.data || event.data === '""') return;

      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        return;
      }

      if (data.agent) {
        const agentMap: Record<string, 'Planner' | 'Coder' | 'Reviewer' | 'Deployer'> = {
          PLANNER: 'Planner',
          CODER: 'Coder',
          REVIEWER: 'Reviewer',
          DEPLOYER: 'Deployer'
        };
        const agent = agentMap[data.agent];

        if (agent) {
          setActiveAgent((prevAgent) => {
            if (prevAgent === 'Reviewer' && agent === 'Coder') {
              setAttempt((prev) => prev + 1);
            }
            return agent;
          });
          
          const eventType = data.data?.eventType;
          const content = data.data?.content || data.data?.message;

          const pushLog = (text: string) => {
            setLogs((prev) => {
              const currentLogs = prev[agent] || [];
              const newLog = { id: Math.random().toString(36).substring(7), text };
              const updated = [...currentLogs, newLog];
              if (updated.length > 4) {
                return {
                  ...prev,
                  [agent]: updated.slice(updated.length - 4)
                };
              }
              return {
                ...prev,
                [agent]: updated
              };
            });
          };

          if (eventType === 'THINKING') {
            setActiveStatus(content || 'Thinking...');
            pushLog(content || 'Thinking...');
            setTools([]);
            setErrorText(null);
            setFailureDescription(null);
          } else if (eventType === 'TOOL_CALL') {
            const tool = data.data?.toolName;
            if (tool) {
              setTools((prev) => [...new Set([...prev, tool])]);
              setUsedTools((prev) => ({
                ...prev,
                [agent]: [...new Set([...(prev[agent] || []), tool])]
              }));
              pushLog(`Calling tool: ${tool}`);
            }
            setActiveStatus(`Calling tool: ${tool}`);
          } else if (eventType === 'ERROR') {
            setErrorText(content || 'An error occurred');
            setFailureDescription(data.data?.message || 'Something went wrong during execution.');
            pushLog(`Error: ${content || 'Execution failed'}`);
          } else if (eventType === 'RESULT') {
            setActiveStatus('Phase complete');
            pushLog('Phase complete');
            setTools([]);
            
            const output = data.data?.output;
            if (agent === 'Planner') {
              setPlannerResult({
                mainText: 'Generated execution plan',
                tags: output?.filesToChange || []
              });
            } else if (agent === 'Coder') {
              setCoderResult({
                mainText: output?.diffSummary || 'Code committed successfully',
                tags: output?.changedFiles || []
              });
            } else if (agent === 'Reviewer') {
              const isApproved = output?.includes('APPROVE') || output?.toLowerCase().includes('approved');
              setReviewerResult({
                mainText: isApproved ? 'Code meets all acceptance criteria. Ready to deploy.' : 'Changes requested by reviewer.'
              });
            } else if (agent === 'Deployer') {
              setDeployerResult({
                mainText: 'PR Merged successfully!'
              });
            }
          }
        }
      }

      if (data.agent === 'DEPLOYER' && data.data?.eventType === 'RESULT') {
        let url = null;
        if (typeof data.data?.output === 'string') {
          url = data.data?.output;
        } else {
          url = data.data?.output?.prUrl || data.data?.output?.pullRequestUrl;
        }

        if (url) {
          setPrUrl(url);
        }
        setIsDone(true);
        eventSource.close();
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE Error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  // Synchronize Nodes with SSE state while preserving user position
  useEffect(() => {
    // Planner node status
    let plannerStatus: NodeStatus = 'Waiting';
    if (activeAgent === 'Planner') {
      plannerStatus = errorText ? 'Failed' : 'Active';
    } else if (['Coder', 'Reviewer', 'Deployer'].includes(activeAgent) || isDone) {
      plannerStatus = 'Done';
    }

    // Coder node status
    let coderStatus: NodeStatus = 'Waiting';
    if (activeAgent === 'Coder') {
      coderStatus = errorText ? 'Failed' : 'Active';
    } else if (['Reviewer', 'Deployer'].includes(activeAgent) || isDone) {
      coderStatus = 'Done';
    }

    // Reviewer node status
    let reviewerStatus: NodeStatus = 'Waiting';
    if (activeAgent === 'Reviewer') {
      reviewerStatus = errorText ? 'Failed' : 'Active';
    } else if (activeAgent === 'Deployer' || isDone) {
      reviewerStatus = 'Approved';
    }

    // Deployer node status
    let deployerStatus: NodeStatus = 'Waiting';
    if (isDone) {
      deployerStatus = 'Merged';
    } else if (activeAgent === 'Deployer') {
      deployerStatus = errorText ? 'Failed' : 'Active';
    }

    const getPlannerData = () => ({
      agentType: 'Planner' as const,
      status: plannerStatus,
      content: {
        mainText: plannerResult?.mainText || (plannerStatus === 'Active' ? activeStatus : undefined),
        description: plannerResult?.mainText ? undefined : 'Reads Linear issue · identifies files to change',
        tags: plannerResult?.tags,
        tools: activeAgent === 'Planner' ? tools : undefined,
        usedTools: usedTools.Planner,
        logs: logs.Planner
      }
    });

    const getCoderData = () => ({
      agentType: 'Coder' as const,
      status: coderStatus,
      attempt: attempt > 1 || coderStatus === 'Active' ? attempt : undefined,
      content: {
        mainText: coderResult?.mainText || (coderStatus === 'Active' ? activeStatus : undefined),
        description: coderResult?.mainText ? undefined : 'Writes code · creates branch · commits',
        tools: coderStatus === 'Active' ? tools : undefined,
        usedTools: usedTools.Coder,
        tags: coderResult?.tags,
        logs: logs.Coder,
        errorText: coderStatus === 'Failed' ? errorText : undefined,
        failureDescription: coderStatus === 'Failed' ? failureDescription : undefined
      }
    });

    const getReviewerData = () => ({
      agentType: 'Reviewer' as const,
      status: reviewerStatus,
      content: {
        mainText: reviewerResult?.mainText || (reviewerStatus === 'Active' ? activeStatus : undefined),
        description: reviewerResult?.mainText ? undefined : 'Reviews diff · approves or rejects',
        tools: reviewerStatus === 'Active' ? tools : undefined,
        usedTools: usedTools.Reviewer,
        logs: logs.Reviewer,
        errorText: reviewerStatus === 'Failed' ? errorText : undefined,
        failureDescription: reviewerStatus === 'Failed' ? failureDescription : undefined
      }
    });

    const getDeployerData = () => ({
      agentType: 'Deployer' as const,
      status: deployerStatus,
      content: {
        mainText: deployerResult?.mainText || (deployerStatus === 'Active' ? activeStatus : (isDone ? 'PR Merged successfully!' : undefined)),
        description: deployerResult?.mainText ? undefined : 'Opens PR · merges · closes Linear issue',
        tools: deployerStatus === 'Active' ? tools : undefined,
        usedTools: usedTools.Deployer,
        logs: logs.Deployer,
        prInfo: prUrl ? 'Pull Request Merged' : undefined,
        issueInfo: prUrl ? 'Linear Issue Closed' : undefined,
        errorText: deployerStatus === 'Failed' ? errorText : undefined,
        failureDescription: deployerStatus === 'Failed' ? failureDescription : undefined
      }
    });

    setNodes((prevNodes) => {
      if (prevNodes.length === 0) {
        return [
          { id: 'planner', type: 'agent', position: { x: 100, y: 250 }, data: getPlannerData() },
          { id: 'coder', type: 'agent', position: { x: 600, y: 250 }, data: getCoderData() },
          { id: 'reviewer', type: 'agent', position: { x: 1100, y: 250 }, data: getReviewerData() },
          { id: 'deployer', type: 'agent', position: { x: 1600, y: 250 }, data: getDeployerData() }
        ];
      }

      return prevNodes.map((node) => {
        if (node.id === 'planner') return { ...node, data: getPlannerData() };
        if (node.id === 'coder') return { ...node, data: getCoderData() };
        if (node.id === 'reviewer') return { ...node, data: getReviewerData() };
        if (node.id === 'deployer') return { ...node, data: getDeployerData() };
        return node;
      });
    });
  }, [activeAgent, activeStatus, isDone, plannerResult, coderResult, reviewerResult, deployerResult, attempt, tools, usedTools, logs, errorText, failureDescription, prUrl, setNodes]);

  // Synchronize Edges with SSE state
  useEffect(() => {
    const isPlannerDone = ['Coder', 'Reviewer', 'Deployer'].includes(activeAgent) || isDone;
    const isCoderDone = ['Reviewer', 'Deployer'].includes(activeAgent) || isDone;
    const isReviewerDone = activeAgent === 'Deployer' || isDone;

    setEdges([
      {
        id: 'e-planner-coder',
        source: 'planner',
        target: 'coder',
        style: { 
          stroke: isPlannerDone ? '#22c55e' : (activeAgent === 'Planner' ? '#3b82f6' : '#3f3f46'), 
          strokeWidth: 3 
        },
        animated: activeAgent === 'Planner',
      },
      {
        id: 'e-coder-reviewer',
        source: 'coder',
        target: 'reviewer',
        style: { 
          stroke: isCoderDone ? '#22c55e' : (activeAgent === 'Coder' ? '#3b82f6' : '#3f3f46'), 
          strokeWidth: 3 
        },
        animated: activeAgent === 'Coder',
      },
      {
        id: 'e-reviewer-deployer',
        source: 'reviewer',
        target: 'deployer',
        style: { 
          stroke: isReviewerDone ? '#22c55e' : (activeAgent === 'Reviewer' ? '#3b82f6' : '#3f3f46'), 
          strokeWidth: 3 
        },
        animated: activeAgent === 'Reviewer',
      },
    ]);
  }, [activeAgent, isDone, setEdges]);

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/restart`, {
        method: "POST"
      });
      const data = await response.json();
      if (response.ok && data.jobId) {
        router.push(`/${data.jobId}`);
      } else {
        alert(data.error || "Failed to restart job");
      }
    } catch (err) {
      alert("Failed to connect to server");
    } finally {
      setIsRestarting(false);
    }
  };

  if (!mounted) {
    return <div className="eventsContainer" style={{ backgroundColor: '#09090b', height: '100vh' }} />;
  }

  return (
    <div className="eventsContainer" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
      <header className="header" style={{ padding: '24px 40px 0 40px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ textAlign: 'left' }}>
          <h1 style={{ margin: 0 }}>Autonomous Agent Flow</h1>
          <p style={{ margin: '4px 0 0 0', color: '#a3a3a3' }}>Job ID: {jobId}</p>
        </div>
        <button
          onClick={handleRestart}
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
