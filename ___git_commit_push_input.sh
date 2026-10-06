#!/bin/bash
# Auto Git Commit and Push Script
# Function: Commit and push all branches with user input message

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to check and clear any existing Git processes and lock files
clear_git_processes() {
    # Check for running git processes
    echo -e "${CYAN}Checking for existing Git processes...${NC}"
    git_pids=$(pgrep -x git 2>/dev/null)

    if [ -n "$git_pids" ]; then
        echo -e "${YELLOW}Found running Git process(es). Attempting to clear...${NC}"
        echo "$git_pids" | while read pid; do
            echo -e "${YELLOW}  Stopping Git process (PID: $pid)...${NC}"
            if jobs -p | grep -q "^${pid}$" 2>/dev/null; then
                disown "$pid" 2>/dev/null
            fi
            kill -9 "$pid" 2>/dev/null
        done
        sleep 2

        remaining_git_pids=$(pgrep -x git 2>/dev/null)
        if [ -n "$remaining_git_pids" ]; then
            echo -e "${RED}Warning: Could not stop all Git processes. Some operations might fail.${NC}"
        else
            echo -e "${GREEN}All Git processes cleared successfully.${NC}"
        fi
    else
        echo -e "${GREEN}No existing Git processes detected.${NC}"
    fi

    # Check and remove git lock files
    echo -e "${CYAN}Checking for Git lock files...${NC}"
    gitDir=".git"
    lockFiles=()

    # Index lock file
    if [ -f "$gitDir/index.lock" ]; then
        lockFiles+=("$gitDir/index.lock")
    fi

    # Check for other possible lock files in .git directory
    if [ -d "$gitDir" ]; then
        while IFS= read -r file; do
            lockFiles+=("$file")
        done < <(find "$gitDir" -name "*.lock" -type f 2>/dev/null)
    fi

    # Remove lock files if found
    if [ ${#lockFiles[@]} -gt 0 ]; then
        echo -e "${YELLOW}Found ${#lockFiles[@]} Git lock file(s). Removing...${NC}"
        for lockFile in "${lockFiles[@]}"; do
            echo -e "${YELLOW}  Removing lock file: $lockFile${NC}"
            rm -f "$lockFile"
            if [ -f "$lockFile" ]; then
                echo -e "${RED}  Failed to remove lock file: $lockFile${NC}"
            else
                echo -e "${GREEN}  Successfully removed lock file: $lockFile${NC}"
            fi
        done
    else
        echo -e "${GREEN}No Git lock files detected.${NC}"
    fi
}

# Clear any existing Git processes and lock files before proceeding
clear_git_processes

# Get current date and format
currentDate=$(date "+%Y-%m-%d %H:%M:%S")
defaultMessage="Daily backup: $currentDate"

# Output start info
echo ""
echo -e "${CYAN}Starting auto git commit and push...${NC}"
echo "Default commit message: $defaultMessage"

# Prompt for commit message
read -p "Enter your commit message (press Enter to use default): " commitMessage

# Use default if empty
if [ -z "$commitMessage" ]; then
    commitMessage="$defaultMessage"
fi

echo "Using commit message: $commitMessage"

# Stage all changes
echo ""
echo "Staging all changed files..."
git add -A
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to stage files${NC}"
    exit 1
fi
echo -e "${GREEN}Files staged successfully${NC}"

# Create commit
echo ""
echo "Creating commit..."
git commit -m "$commitMessage"
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to create commit${NC}"
    exit 1
fi
echo -e "${GREEN}Commit created successfully${NC}"

# Push all branches
echo ""
echo "Pushing all branches to remote..."
git push --all origin
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to push branches${NC}"
    exit 1
fi
echo -e "${GREEN}Branches pushed successfully${NC}"

# Record last push time
currentDateTime=$(date "+%Y-%m-%d %H:%M:%S")
echo ""
echo -e "${GREEN}Auto git commit and push completed successfully!${NC}"
