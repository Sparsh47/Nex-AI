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
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/test`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              issueId: "NEX-6",
              linearIssueUrl: "http://linear.app/LINEAR-789",
            }),
          },
        );
        const data = await response.json();

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
