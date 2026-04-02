// # Components

// ## User Card
function UserCard({ name, age }) {
  return (
    <div>
      {/* # Render */}

      {/* ## Header */}
      <h2>{name}</h2>

      {/* ## Body */}
      <p>Age: {age}</p>
    </div>
  );
}

/** # Services */

/** ## Data Fetching */
async function fetchUser(id) {
  return { name: 'test', age: 20 };
}

// # Utilities
function formatName(name) {
  return name.trim();
}

export default UserCard;
