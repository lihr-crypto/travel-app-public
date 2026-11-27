import React from 'react';

export default function ItemIcon({ name }) {
  const paths = {
    place: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    sightseeing: 'm3 9 9-6 9 6M5 10v9m7-9v9m7-9v9M3 21h18',
    food: 'M5 3v6m4-6v6M3 3v6a4 4 0 0 0 8 0V3M7 13v8M20 21V3c-4 2-5 6-5 10h5',
    hotel: 'M3 21V7h18v14M3 17h18M7 11h3v3H7zm7 0h3v3h-3z',
    activity: 'M5 5h14v16H5zM8 3v4m8-4v4M5 10h14m-10 5 2 2 4-4',
    transport: 'M6 17h12V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12Zm0-8h12M6 21l3-4m9 4-3-4M9 13h.01M15 13h.01',
    custom: 'M5 5h4v4H5zm10 0h4v4h-4zM5 15h4v4H5zm10 0h4v4h-4z',
    time: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
    note: 'M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 12h8m-8 4h6',
  };
  return <svg className="editor-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
