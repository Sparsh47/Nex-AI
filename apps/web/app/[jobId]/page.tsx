"use client";
import { useEffect, useState, use } from "react";
import "../events.css";

const AGENTS = ["PLANNER", "CODER", "REVIEWER", "DEPLOYER"];

export default function JobIdPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  const [activeAgent, setActiveAgent] = useState("PLANNER");
  const [activeStatus, setActiveStatus] = useState("Initializing...");
  const [isDone, setIsDone] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);

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
        setActiveAgent(data.agent);
        setActiveStatus(getEventDescription(data));
      }

      if (data.agent === 'DEPLOYER' && data.data?.eventType === 'RESULT') {
        let url = null;
        if (typeof data.data?.output === 'string') {
        } else {
          url = data.data?.output?.prUrl;
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

  return (
    <div className="eventsContainer">
      <header className="header">
        <h1>Autonomous Agent Flow</h1>
        <p>Job ID: {jobId}</p>
      </header>

      <div className="pipelineContainer">
        {AGENTS.map((agent, idx) => {
          const isCompleted = isDone || AGENTS.indexOf(activeAgent) > idx;
          const isActive = !isDone && agent === activeAgent;
          const isPending = !isDone && AGENTS.indexOf(activeAgent) < idx;

          let className = "nodeBox";
          if (isCompleted) className += " completed";
          if (isActive) className += " active";
          if (isPending) className += " pending";

          return (
            <div key={agent} className="nodeWrapper">
              <div className={className}>
                <div className="nodeTitle">{agent}</div>
                <div className="nodeStatus">
                  {isActive ? (
                    <><span className="pulse"></span> {activeStatus}</>
                  ) : isCompleted ? (
                    "Completed ✓"
                  ) : (
                    "Waiting..."
                  )}
                </div>
              </div>
              {idx < AGENTS.length - 1 && (
                <div className={`arrow ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`}></div>
              )}
            </div>
          );
        })}
      </div>

      {isDone && (
        <div className="successPanel">
          <span className="successIcon">🚀</span>
          <h2>Mission Accomplished!</h2>
          <p>The pipeline has successfully completed all tasks and deployment.</p>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" className="prLink">
              View Merged Pull Request
            </a>
          )}
        </div>
      )}
    </div>
  );
}
