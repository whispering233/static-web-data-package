import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CollectionList,
  CollectionTable,
  RecordDetails,
  StaticDataProvider,
  useStaticDataClient
} from "./index.js";

describe("react templates", () => {
  it("provides a client through context", () => {
    const client = { collection: () => ({}) } as never;
    function Probe() {
      const value = useStaticDataClient();
      return <span>{value === client ? "ok" : "missing"}</span>;
    }

    expect(renderToString(<StaticDataProvider client={client}><Probe /></StaticDataProvider>)).toContain("ok");
  });

  it("renders table, list, and details without consumer CSS", () => {
    const records = [
      { id: "a", title: "Alpha", published: true },
      { id: "b", title: "Beta", published: false }
    ];

    const table = renderToString(<CollectionTable records={records} columns={["id", "title", "published"]} />);
    const list = renderToString(<CollectionList records={records} titleField="title" />);
    const details = renderToString(<RecordDetails record={records[0]} />);

    expect(table).toContain("Alpha");
    expect(table).toContain("swd-table");
    expect(list).toContain("Beta");
    expect(details).toContain("published");
  });
});
