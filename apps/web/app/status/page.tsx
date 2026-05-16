"use client";
import styles from "../page.module.css";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StatusPage() {
  const [jobId, setJobId] = useState("");
  const [statusData, setStatusData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleCheckStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobId) return;

    setLoading(true);
    setError("");
    setStatusData(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/jobs/${jobId}/status`);
      const data = await response.json();

      if (response.ok) {
        setStatusData(data);
      } else {
        setError(data.error || "Failed to fetch status");
      }
    } catch (err) {
      setError("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.hero}>
          <h1 className={styles.title}>Job Status Tracker</h1>
          <p className={styles.subtitle}>Enter your Job UUID to check the current progress</p>
        </div>

        <form className={styles.form} onSubmit={handleCheckStatus}>
          <div className={styles.inputGroup}>
            <label htmlFor="jobId">Job ID (UUID)</label>
            <input
              id="jobId"
              type="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className={styles.submitBtn} style={{ flex: 1 }} type="submit" disabled={loading}>
              {loading ? "Checking..." : "Check Status"}
            </button>
            <button 
              className={styles.submitBtn} 
              style={{ flex: 1, background: 'transparent', border: '1px solid #fff', color: '#fff' }} 
              type="button"
              onClick={() => jobId && router.push(`/${jobId}`)}
            >
              Go to Live View
            </button>
          </div>
        </form>

        {statusData && (
          <div className={styles.form} style={{ marginTop: '2rem', textAlign: 'left' }}>
            <h3 style={{ color: '#fff', marginBottom: '1rem' }}>Current Status</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ color: '#94a3b8' }}>Agent: <span style={{ color: '#fff', fontWeight: 600 }}>{statusData.lastAgent}</span></p>
              <p style={{ color: '#94a3b8' }}>Event: <span style={{ color: '#fff', fontWeight: 600 }}>{statusData.status}</span></p>
              <p style={{ color: '#94a3b8' }}>Last Updated: <span style={{ color: '#fff' }}>{new Date(parseInt(statusData.lastUpdate)).toLocaleString()}</span></p>
            </div>
          </div>
        )}

        {error && (
          <div style={{ marginTop: '2rem', color: '#ef4444', textAlign: 'center', fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button 
          onClick={() => router.push('/')}
          style={{ marginTop: '2rem', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Back to Home
        </button>
      </main>
    </div>
  );
}
