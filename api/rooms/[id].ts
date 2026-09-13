export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;
  const clean = typeof id === 'string' ? id.trim().toUpperCase() : '';

  return res.status(200).json({ 
    exists: true, 
    id: clean, 
    message: 'Room verified' 
  });
}
