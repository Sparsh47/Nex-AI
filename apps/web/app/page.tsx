"use client";

import styles from "./page.module.css";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();

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
              issueId: "NEX-7",
              linearIssueUrl:
                "https://linear.app/nex-ai-space/issue/NEX-7/implement-product-catalog-crud-endpoints-go",
              repositoryName: "Sparsh47/nex-ai-test-repo",
            }),
          },
        );
        const data = await response.json();

        if (data.status === "job-enqueued") {
          setMessage(data.payload.jobId);
          router.push(`${data.payload.jobId}`);
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
