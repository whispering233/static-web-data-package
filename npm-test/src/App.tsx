import { StaticDataProvider, CollectionTable, useCollectionQuery } from "@whispering233/static-web-data-react";
import { createStaticDataClient } from "@whispering233/static-web-data";

type Post = {
  id: string;
  title: string;
  published: boolean;
};

const client = createStaticDataClient({ baseUrl: "/static-web-data" });

export function App() {
  return (
    <StaticDataProvider client={client}>
      <main>
        <h1>Static Web Data npm test</h1>
        <Posts />
      </main>
    </StaticDataProvider>
  );
}

function Posts() {
  const { data, loading, error } = useCollectionQuery<Post>("posts", {
    sort: [{ field: "title", direction: "asc" }]
  });

  if (loading) {
    return <p>Loading...</p>;
  }
  if (error) {
    return <p>{error.message}</p>;
  }

  return (
    <CollectionTable
      records={data?.items ?? []}
      columns={[
        "id",
        "title",
        {
          key: "published",
          label: "Published",
          render: (value) => (value ? "Yes" : "No")
        }
      ]}
    />
  );
}
