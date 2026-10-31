import type { DigestNight } from '../digest/types.js';

export function Digest(props: { digest: DigestNight }) {
  const { night, rows, badLines } = props.digest;
  return (
    <>
      <h1>digest · {night}</h1>
      <p class={badLines > 0 ? 'warn' : 'mute'}>bad lines: {badLines}</p>
      {rows.length === 0 ? (
        <p>nothing ran</p>
      ) : (
        <div class="table-scroll" tabindex={0} role="region" aria-label="Digest jobs">
          <table>
            <thead>
              <tr>
                <th scope="col">job</th>
                <th scope="col">owner</th>
                <th scope="col">runs</th>
                <th scope="col">retries</th>
                <th scope="col">last status</th>
                <th scope="col">last error</th>
                <th scope="col">first time</th>
                <th scope="col">last time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr class={row.retries >= 3 || row.hasFailure ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}{row.retries >= 3 ? ' (high retries)' : ''}</td>
                  <td>{row.lastStatus}{row.hasFailure ? ' (failure recorded)' : ''}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
