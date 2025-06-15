export default function handler(req, res) {
  const { userEmail, data } = req.body;

  if (!userEmail || !Array.isArray(data)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const matchThree = data.filter(row =>
    row.Email === userEmail &&
    row.Manager_Email === userEmail &&
    row.Head_Email === userEmail
  );

  if (matchThree.length > 0) return res.status(200).json(matchThree);

  const matchTwo = data.filter(row =>
    row.Email === userEmail &&
    row.Manager_Email === userEmail
  );

  if (matchTwo.length > 0) return res.status(200).json(matchTwo);

  const matchOne = data.filter(row =>
    row.Email === userEmail
  );

  if (matchOne.length > 0) return res.status(200).json(matchOne);

  return res.status(404).json({ message: "User not found in any role" });
}
