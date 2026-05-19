import React from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
    Network,
    Code,
    Eye,
    Rocket,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Play,
    Check,
    Terminal
} from 'lucide-react';
import './agentNodes.css';

export type NodeStatus = 'Waiting' | 'Active' | 'Done' | 'Approved' | 'Merged' | 'Failed';
export type AgentType = 'Planner' | 'Coder' | 'Reviewer' | 'Deployer';

export type SpecificHandle = {
    type: 'target' | 'source';
    id: string;
    position: Position;
    label: string;
    className?: string; // For color overrides
};

export interface AgentNodeData extends Record<string, unknown> {
    agentType: AgentType;
    status: NodeStatus;
    attempt?: number;
    content: {
        mainText?: string;
        description?: string;
        tags?: string[];
        tools?: string[]; // tools currently active (being used)
        usedTools?: string[]; // history of tools (have been used)
        logs?: Array<{ id: string; text: string }>; // stream logs / thinking history
        commitCount?: string;
        prInfo?: string;
        issueInfo?: string;
        errorText?: string;
        failureDescription?: string;
    };
    specificHandles?: SpecificHandle[];
}

export type AgentCustomNode = Node<AgentNodeData, 'agent'>;

export const AgentNode: React.FC<NodeProps<AgentCustomNode>> = ({ data }) => {
    const { agentType, status, attempt, content, specificHandles } = data;
    const [isExpanded, setIsExpanded] = React.useState(false);

    const iconMap = {
        Planner: <Network style={{ width: '20px', height: '20px' }} />,
        Coder: <Code style={{ width: '20px', height: '20px' }} />,
        Reviewer: <Eye style={{ width: '20px', height: '20px' }} />,
        Deployer: <Rocket style={{ width: '20px', height: '20px' }} />,
    };

    const statusTextMap: Record<NodeStatus, string> = {
        Waiting: 'Waiting',
        Active: 'Active',
        Done: 'Done',
        Approved: 'Approved',
        Merged: 'Merged',
        Failed: 'Failed',
    };

    const hasTools = (content.tools && content.tools.length > 0) || (content.usedTools && content.usedTools.length > 0) || (content.logs && content.logs.length > 0);

    return (
        <div className={`agent-node status-${status}`}>
            {!specificHandles && <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />}

            <div className="agent-node-body">
                <div className="agent-node-header">
                    <div className="agent-header-left">
                        {iconMap[agentType]}
                        <h1>{agentType}</h1>
                        {attempt && (
                            <span className="badge-attempt">
                                attempt {attempt}
                            </span>
                        )}
                    </div>
                    <div className="agent-header-right">
                        <span className={`status-text color-${status}`}>
                            {statusTextMap[status]}
                        </span>
                        <div className={`status-dot bg-${status}`} />
                    </div>
                </div>

                {status === 'Failed' && content.errorText && (
                    <p className="text-error-main">{content.errorText}</p>
                )}

                {content.failureDescription && (
                    <p className="text-error-desc">{content.failureDescription}</p>
                )}

                {(status !== 'Failed' && content.mainText) && (
                    <p className={`text-main ${status === 'Waiting' ? 'color-Waiting' : `color-${status}`}`}>{content.mainText}</p>
                )}

                {content.description && (
                    <p className="text-desc">{content.description}</p>
                )}

                {status === 'Done' && (
                    <>
                        {content.commitCount && <p className="commit-count-text">{content.commitCount}</p>}
                        {content.tags && (
                            <div className="tags-container">
                                {content.tags.map((tag) => (
                                    <span key={tag} className="tag-done">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {status === 'Merged' && (
                    <div className="merged-container">
                        <a href="#" className="pr-link">
                            <Network style={{ width: '16px', height: '16px' }} />
                            <span>{content.prInfo}</span>
                            <ExternalLink style={{ width: '14px', height: '14px', marginLeft: '4px' }} />
                        </a>
                        <p className="issue-info-text">{content.issueInfo}</p>
                    </div>
                )}

                {hasTools && (
                    <div className="tools-expansion-wrapper">
                        <button 
                            type="button"
                            className="expand-toggle-btn"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <div className="expand-btn-left">
                                <Terminal style={{ width: '14px', height: '14px' }} />
                                <span>{isExpanded ? 'Hide execution details' : 'Show execution details'}</span>
                            </div>
                            {isExpanded ? <ChevronUp style={{ width: '16px', height: '16px' }} /> : <ChevronDown style={{ width: '16px', height: '16px' }} />}
                        </button>

                        {isExpanded && (
                            <div className="expanded-tools-panel">
                                {content.logs && content.logs.length > 0 && (
                                    <div className="expanded-section">
                                        <h4 className="expanded-section-title">Live Stream</h4>
                                        <div className="streaming-logs-container">
                                            {content.logs.map((log, index) => {
                                                const total = content.logs!.length;
                                                const opacity = total > 1 ? (index + 1) / total : 1.0;
                                                return (
                                                    <div 
                                                        key={log.id} 
                                                        className="streaming-log-item"
                                                        style={{ opacity }}
                                                    >
                                                        <span className="streaming-log-bullet">&gt;</span>
                                                        <span className="streaming-log-text">{log.text}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {content.tools && content.tools.length > 0 && (
                                    <div className="expanded-section">
                                        <h4 className="expanded-section-title">
                                            <span className="pulse-blue"></span> Active Tools
                                        </h4>
                                        <div className="tools-list">
                                            {content.tools.map((tool) => (
                                                <div key={tool} className="tool-item active-tool">
                                                    <Play style={{ width: '12px', height: '12px', fill: '#3b82f6', color: '#3b82f6' }} />
                                                    <span>{tool}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {content.usedTools && content.usedTools.length > 0 && (
                                    <div className="expanded-section">
                                        <h4 className="expanded-section-title">Used Tools</h4>
                                        <div className="tools-list">
                                            {content.usedTools.map((tool) => (
                                                <div key={tool} className="tool-item completed-tool">
                                                    <Check style={{ width: '12px', height: '12px', color: '#22c55e' }} />
                                                    <span>{tool}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {specificHandles && (
                <div className="handles-footer">
                    {specificHandles.map((handleSpec) => {
                        const isRed = handleSpec.className?.includes('text-[#ef4444]');
                        return (
                            <div key={handleSpec.id} className={`handle-spec-item ${isRed ? 'color-Failed' : 'color-Waiting'}`}>
                                <Handle
                                    type={handleSpec.type}
                                    position={handleSpec.position}
                                    id={handleSpec.id}
                                    className={isRed ? 'bg-Failed' : 'bg-Waiting'}
                                />
                                {handleSpec.label}
                            </div>
                        );
                    })}
                </div>
            )}

            {!specificHandles && <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />}
        </div>
    );
};