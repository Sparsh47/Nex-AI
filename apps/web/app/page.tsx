"use client";
import styles from "./page.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [linearUrl, setLinearUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const issueIdMatch = linearUrl.match(/issue\/([A-Z]+-\d+)/);
    const issueId = issueIdMatch ? issueIdMatch[1] : null;

    if (!issueId) {
      alert("Invalid Linear URL. Could not extract Issue ID.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId,
          linearIssueUrl: linearUrl,
          repositoryName: repoName,
        }),
      });
      const data = await response.json();

      if (data.status === "job-enqueued") {
        router.push(`/${data.jobId}`);
      } else {
        alert("Error: " + (data.message || "Failed to enqueue job"));
      }
    } catch (error) {
      console.error(error);
      alert("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Agentic Workflow</h1>
          <p className={styles.subtitle}>Autonomous AI coding agents at your service</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label htmlFor="linearUrl">Linear Issue URL</label>
            <input
              id="linearUrl"
              type="url"
              placeholder="https://linear.app/.../issue/NEX-7/..."
              value={linearUrl}
              onChange={(e) => setLinearUrl(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="repoName">GitHub Repository</label>
            <input
              id="repoName"
              type="text"
              placeholder="owner/repo"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              required
            />
          </div>

          <button className={styles.submitBtn} type="submit" disabled={loading}>
            {loading ? "Enqueuing..." : "Start Agentic Loop"}
          </button>
        </form>

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Already have a job running?{' '}
            <button 
              onClick={() => router.push('/status')}
              style={{ color: '#fff', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            >
              Check Job Status
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

