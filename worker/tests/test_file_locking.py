"""Tests for file-based locking to prevent concurrent mesh corruption (Bug #7)."""

import os
import tempfile
from pathlib import Path

import pytest

try:
    from worker.file_locking import FileLock, FileLockError, check_lock_status, mesh_generation_lock
except ImportError:
    # Fallback if running from different directory
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from file_locking import FileLock, FileLockError, check_lock_status, mesh_generation_lock


class TestFileLockBasic:
    """Test basic file lock acquire/release."""
    
    def test_lock_acquire_release(self, tmp_path):
        """Should acquire and release lock successfully."""
        lock_file = tmp_path / "test.lock"
        lock = FileLock(lock_file, case_id="test-case")
        
        # Should not raise
        lock.acquire()
        assert lock.fd is not None
        
        lock.release()
        assert lock.fd is None
    
    def test_lock_context_manager(self, tmp_path):
        """Lock should work as context manager."""
        lock_file = tmp_path / "test.lock"
        lock = FileLock(lock_file, case_id="test-case")
        
        with lock:
            assert lock.fd is not None
        
        assert lock.fd is None
    
    def test_lock_file_created(self, tmp_path):
        """Lock file should be created and cleaned up."""
        lock_file = tmp_path / "test.lock"
        assert not lock_file.exists()
        
        lock = FileLock(lock_file, case_id="test-case")
        with lock:
            assert lock_file.exists()
        
        # Lock file should be cleaned up
        assert not lock_file.exists()
    
    def test_lock_prevents_duplicate_acquisition(self, tmp_path):
        """Second lock should fail if first holds the lock."""
        lock_file = tmp_path / "test.lock"
        
        lock1 = FileLock(lock_file, case_id="job-1")
        lock1.acquire()
        
        try:
            lock2 = FileLock(lock_file, case_id="job-2")
            with pytest.raises(FileLockError, match="locked by another"):
                lock2.acquire()
        finally:
            lock1.release()
    
    def test_lock_releases_on_exception(self, tmp_path):
        """Lock should be released even if code raises exception."""
        lock_file = tmp_path / "test.lock"
        lock = FileLock(lock_file, case_id="test-case")
        
        try:
            with lock:
                assert lock.fd is not None
                raise ValueError("Test exception")
        except ValueError:
            pass
        
        # Lock should be released
        assert lock.fd is None
        assert not lock_file.exists()


class TestMeshGenerationLock:
    """Test mesh_generation_lock convenience wrapper."""
    
    def test_mesh_lock_context_manager(self, tmp_path):
        """mesh_generation_lock should work as context manager."""
        case_dir = tmp_path / "test-case"
        case_dir.mkdir()
        
        with mesh_generation_lock(case_dir, "test-case"):
            lock_file = case_dir / ".mesh_lock"
            assert lock_file.exists()
        
        # Lock file cleaned up
        assert not lock_file.exists()
    
    def test_mesh_lock_prevents_concurrent_access(self, tmp_path):
        """Second mesh generation should fail if first is running."""
        case_dir = tmp_path / "test-case"
        case_dir.mkdir()
        
        with mesh_generation_lock(case_dir, "job-1"):
            # Try to acquire lock for second job
            with pytest.raises(FileLockError, match="locked by another"):
                with mesh_generation_lock(case_dir, "job-2"):
                    pass


class TestCheckLockStatus:
    """Test checking if a case is currently locked."""
    
    def test_unlocked_case_returns_false(self, tmp_path):
        """Case with no lock should return False."""
        case_dir = tmp_path / "test-case"
        case_dir.mkdir()
        
        assert check_lock_status(case_dir, "test-case") is False
    
    def test_locked_case_returns_true(self, tmp_path):
        """Case with active lock should return True."""
        case_dir = tmp_path / "test-case"
        case_dir.mkdir()
        
        lock = FileLock(case_dir / ".mesh_lock", case_id="test-case")
        lock.acquire()
        
        try:
            assert check_lock_status(case_dir, "test-case") is True
        finally:
            lock.release()
    
    def test_cleaned_up_lock_returns_false(self, tmp_path):
        """After lock is released, status should return False."""
        case_dir = tmp_path / "test-case"
        case_dir.mkdir()
        
        lock = FileLock(case_dir / ".mesh_lock", case_id="test-case")
        with lock:
            assert check_lock_status(case_dir) is True
        
        # After release
        assert check_lock_status(case_dir) is False


class TestLockWithMultipleProcesses:
    """Test locking behavior with multiple processes (simulated)."""
    
    def test_sequential_lock_acquisition(self, tmp_path):
        """Sequential acquisitions should work correctly."""
        lock_file = tmp_path / "test.lock"
        
        # Job 1
        lock1 = FileLock(lock_file, case_id="job-1")
        lock1.acquire()
        lock1.release()
        
        # Job 2 (after Job 1 released)
        lock2 = FileLock(lock_file, case_id="job-2")
        lock2.acquire()
        lock2.release()
    
    def test_lock_timeout_behavior(self, tmp_path):
        """Lock with timeout should handle waiting (simplified test)."""
        lock_file = tmp_path / "test.lock"
        
        lock1 = FileLock(lock_file, timeout=0.1, case_id="job-1")
        lock1.acquire()
        
        try:
            # In real scenario, this would timeout after 0.1 seconds
            lock2 = FileLock(lock_file, timeout=0.01, case_id="job-2")
            with pytest.raises(FileLockError):
                lock2.acquire()
        finally:
            lock1.release()


class TestLockRobustness:
    """Test edge cases and robustness."""
    
    def test_lock_with_deep_directory_path(self, tmp_path):
        """Lock should work with nested directory structure."""
        case_dir = tmp_path / "cases" / "nested" / "deep" / "case-123"
        case_dir.mkdir(parents=True)
        
        with mesh_generation_lock(case_dir, "deep-case"):
            assert (case_dir / ".mesh_lock").exists()
    
    def test_multiple_release_calls_safe(self, tmp_path):
        """Calling release multiple times should not crash."""
        lock_file = tmp_path / "test.lock"
        lock = FileLock(lock_file, case_id="test-case")
        
        lock.acquire()
        lock.release()
        lock.release()  # Second release should not raise
    
    def test_lock_with_special_characters_in_case_id(self, tmp_path):
        """Lock should handle special characters in case ID (logging only)."""
        lock_file = tmp_path / "test.lock"
        
        # Special chars in case_id (for logging)
        with mesh_generation_lock(tmp_path, case_id="case/with-special_chars.123"):
            assert lock_file.exists()
