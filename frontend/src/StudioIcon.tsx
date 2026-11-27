const paths = {
  projects:'M3 6h7l2 2h9v12H3z M3 6V4h7l2 2', content:'M5 3h11l3 3v15H5z M8 9h8M8 13h8M8 17h5',
  directions:'M4 19v-4c0-5 8-3 8-8V4m-3 3 3-3 3 3m-9 7c3-4 10-1 13-5m-3 0h3v3',
  narrative:'M3 5q5-2 9 1 4-3 9-1v14q-5-2-9 1-4-3-9-1z M12 6v14', scenario:'M3 9h5v5H3zM16 3h5v5h-5zM16 16h5v5h-5zM8 11h4V6h4M12 11v7h4',
  atlas:'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15', bible:'M4 4h13v16H4z M7 7h7m-7 4h7m-7 4h4m9-8v15H7',
  verification:'M12 2l8 3v6c0 5-3 8-8 11-5-3-8-6-8-11V5z M8 11l3 3 5-6', operations:'M3 6h10m4 0h4M3 12h3m4 0h11M3 18h11m4 0h3 M13 4v4m-7 2v4m8 2v4',
  import:'M12 3v11m-4-4 4 4 4-4M4 15v5h16v-5', add:'M12 4v16M4 12h16', arrow:'M4 12h16m-6-6 6 6-6 6',
  compass:'M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM12 5v14m-7-7h14',
};
export function StudioIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="studio-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d={paths[name]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
