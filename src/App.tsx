// Two-row layout: timer on top, 52-week focus heatmap below.
// Placeholders until components/Timer and components/Heatmap are built.
export default function App() {
  return (
    <main className="app">
      <section className="card" aria-labelledby="timer-heading">
        <h2 id="timer-heading">Timer</h2>
      </section>
      <section className="card" aria-labelledby="heatmap-heading">
        <h2 id="heatmap-heading">Focus — last 52 weeks</h2>
      </section>
    </main>
  )
}
