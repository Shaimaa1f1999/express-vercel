export default function handler(req, res) {
  const { projects, targetProjectName } = req.body;

  const matched = projects.find(
    (p) => p.name.trim().toLowerCase() === targetProjectName.trim().toLowerCase()
  );

  if (!matched) {
    return res.status(404).json({ message: "Project not found" });
  }

  return res.status(200).json({
    projectName: matched.projectName,
    id_string: matched.id_string,
    userURL: matched.userURL,
    id_string_explicit: matched.id_string // الإضافة الجديدة فقط
  });
}
