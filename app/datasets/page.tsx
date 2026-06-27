import Link from "next/link";
import { createDatasetAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { listDatasets, listRuns } from "@/lib/store/file-store";

export default async function DatasetsPage() {
  const [datasets, runs] = await Promise.all([listDatasets(), listRuns()]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Benchmark datasets</h1>
        <p className="text-muted-foreground">Save known-bug tasks and rerun them across orchestration workflows.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Saved tasks</h2>
          {datasets.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-10 text-center">No datasets yet.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Runs</TableHead>
                      <TableHead>Resolved</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datasets.map((task) => {
                      const relatedRuns = runs.filter((run) => run.benchmarkTaskId === task.id);
                      const runCount = relatedRuns.length;
                      const resolvedCount = relatedRuns.filter((run) => run.evaluation.resolved).length;

                      return (
                        <TableRow key={task.id}>
                          <TableCell>
                            <Link href={`/datasets/${task.id}`} className="font-medium hover:underline">
                              {task.title}
                            </Link>
                          </TableCell>
                          <TableCell>{task.source}</TableCell>
                          <TableCell>{task.language}</TableCell>
                          <TableCell>{runCount}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {runCount === 0 ? "—" : `${resolvedCount}/${runCount}`}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create task</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createDatasetAction} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="language">Language</Label>
                <Input id="language" name="language" required defaultValue="TypeScript" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="prompt">Prompt</Label>
                <Textarea id="prompt" name="prompt" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="code">Code</Label>
                <Textarea id="code" name="code" required className="font-mono" rows={8} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="knownBugTitle">Known bug title</Label>
                <Input id="knownBugTitle" name="knownBugTitle" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="knownBugDescription">Known bug description</Label>
                <Textarea id="knownBugDescription" name="knownBugDescription" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="knownBugSeverity">Known bug severity</Label>
                <Select name="knownBugSeverity" defaultValue="medium">
                  <SelectTrigger id="knownBugSeverity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" name="tags" placeholder="auth, typescript" />
              </div>
              <Button type="submit">Save dataset task</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
