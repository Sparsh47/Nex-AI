"use client";

import styles from "./page.module.css";
import { useEffect, useState } from "react";

export default function Home() {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const response = await fetch("http://localhost:8000/api/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            issueId: "LINEAR-123",
            linearIssueUrl: "http://linear.app/LINEAR-123",
          }),
        });
        const data = await response.json();

        console.log("Data: ", data);
        if (data.status === "job-enqueued") {
          setMessage(data.payload.linearIssueUrl);
        } else {
          setMessage("Error fetching from api service");
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className={styles.page}>
      <h1 className="text-white">{loading ? "Loading..." : message}</h1>
    </div>
  );
}
