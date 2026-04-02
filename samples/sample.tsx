// # Components

// ## User Card
interface UserCardProps {
  name: string;
  age: number;
}

function UserCard({ name, age }: UserCardProps) {
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
async function fetchUser(id: number): Promise<UserCardProps> {
  return { name: 'test', age: 20 };
}

// # Utilities
function formatName(name: string): string {
  return name.trim();
}

export default UserCard;
