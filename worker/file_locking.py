"""File-based locking to prevent concurrent mesh generation on same case."""

import fcntl
import logging
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Generator, Optional

logger = logging.getLogger(__name__)


class FileLockError(RuntimeError):
    """Raised when a file lock cannot be acquired."""
    pass


class FileLock:
    """Context manager for file-based locking.
    
    Prevents concurrent access to a resource (e.g., case directory)
    using a lock file. Only works on Unix-like systems with fcntl support.
    """
    
    def __init__(self, lock_file: Path, timeout: Optional[float] = None, 
                 case_id: str = "unknown"):
        """
        Args:
            lock_file: Path to lock file (typically case_dir/.mesh_lock)
            timeout: Timeout in seconds (None = block indefinitely)
            case_id: Case identifier for logging
        """
        self.lock_file = Path(lock_file)
        self.timeout = timeout
        self.case_id = case_id
        self.fd = None
    
    def acquire(self) -> None:
        """Acquires the lock. Blocks until lock is available."""
        self.lock_file.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            # Open lock file (create if doesn't exist)
            self.fd = os.open(
                str(self.lock_file),
                os.O_CREAT | os.O_WRONLY,
                0o644
            )
        except OSError as e:
            raise FileLockError(f"Cannot create lock file {self.lock_file}: {e}")
        
        try:
            # Attempt to acquire exclusive lock (non-blocking)
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            logger.info(f"[Case {self.case_id}] Lock acquired: {self.lock_file}")
        except IOError:
            os.close(self.fd)
            self.fd = None
            raise FileLockError(
                f"Case {self.case_id} is locked by another process. "
                f"Mesh generation is already in progress. Wait for the previous job to complete."
            )
    
    def release(self) -> None:
        """Releases the lock."""
        if self.fd is None:
            return
        
        try:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)
            self.fd = None
            
            # Clean up lock file
            try:
                self.lock_file.unlink()
            except FileNotFoundError:
                pass
            
            logger.info(f"[Case {self.case_id}] Lock released: {self.lock_file}")
        except Exception as e:
            logger.warning(f"[Case {self.case_id}] Error releasing lock: {e}")
    
    def __enter__(self):
        """Context manager entry."""
        self.acquire()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()


@contextmanager
def mesh_generation_lock(case_dir: Path, case_id: str = "unknown") -> Generator:
    """Context manager for mesh generation locking.
    
    Usage:
        with mesh_generation_lock(case_dir, "my-case-123"):
            # Mesh generation code here
            generate_mesh(case_dir)
    
    Args:
        case_dir: Path to case directory
        case_id: Case identifier for logging
    
    Raises:
        FileLockError: If lock cannot be acquired
    """
    lock_file = case_dir / ".mesh_lock"
    lock = FileLock(lock_file, case_id=case_id)
    
    with lock:
        yield


def check_lock_status(case_dir: Path, case_id: str = "unknown") -> bool:
    """Checks if a case is currently locked (mesh generation in progress).
    
    Args:
        case_dir: Path to case directory
        case_id: Case identifier for logging
    
    Returns:
        True if locked, False otherwise
    """
    lock_file = case_dir / ".mesh_lock"
    
    if not lock_file.exists():
        return False
    
    try:
        # Try to open and get status without acquiring
        fd = os.open(str(lock_file), os.O_RDONLY)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            # If we got the lock, it wasn't held
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
            return False
        except IOError:
            # Lock is held by another process
            os.close(fd)
            logger.info(f"[Case {case_id}] Mesh generation in progress (lock held)")
            return True
    except Exception as e:
        logger.debug(f"[Case {case_id}] Error checking lock status: {e}")
        return False
